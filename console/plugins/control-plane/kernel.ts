import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";
import {
  SCHEMA_VERSION,
  STATE_TRANSITIONS,
  TERMINAL_STATES,
  type AdapterConfig,
  type AgentProfile,
  type AgentSession,
  type ExecutionEvent,
  type ExecutionState,
  type ExecutionSummary,
  type GuardFinding,
  type PlanManifest,
  type ReviewRequest,
  type ReviewVerdict,
  type TaskAssignment,
  type VerificationEvidence,
} from "./contracts";
import { runAdapter } from "./adapter";
import { collectGitEvidence, assertCleanWorkspace, commitExecutionChanges, createExecutionWorktree, removeExecutionWorktree, resolveCommit, runGates } from "./git";
import { anyScopeOverlap, filesOutsideScopes, listRepositoryFiles, normalizeScope } from "./scope";
import { parseExecutionEvent, parseReviewVerdict } from "./schemas";
import { ControlPlaneStore } from "./store";

type Row = Record<string, unknown>;

function now() { return new Date().toISOString(); }

function parseJson<T>(value: unknown): T { return JSON.parse(String(value)) as T; }

function asExecution(row: Row): ExecutionSummary {
  return {
    schema_version: SCHEMA_VERSION,
    execution_id: String(row.execution_id), assignment_id: String(row.assignment_id),
    worker_agent_id: String(row.worker_agent_id), worker_session_id: String(row.worker_session_id),
    state: String(row.state) as ExecutionState, worktree_path: row.worktree_path ? String(row.worktree_path) : null,
    branch_name: row.branch_name ? String(row.branch_name) : null, pid: row.pid == null ? null : Number(row.pid),
    started_at: row.started_at ? String(row.started_at) : null, updated_at: String(row.updated_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    failure_code: row.failure_code ? String(row.failure_code) : null,
  };
}

export class ControlPlaneKernel {
  readonly workspaceRoot: string;
  readonly store: ControlPlaneStore;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.store = new ControlPlaneStore(this.workspaceRoot);
  }

  close() { this.store.close(); }

  async init() {
    const dirs = ["events", "evidence", "artifacts", "comms/inboxes", "comms/outboxes", "commands", "sprints", "plans", "manifests"];
    await Promise.all(dirs.map((dir) => fsp.mkdir(path.join(this.store.root, dir), { recursive: true })));
    const configPath = path.join(this.store.root, "control-plane.config.json");
    try { await fsp.access(configPath); } catch {
      const config: AdapterConfig = {
        mode: "mock", python_executable: "python3", router_path: "../dual-llm-router",
        timeout_ms: 30 * 60_000, termination_grace_ms: 5_000, env_allowlist: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
      };
      await fsp.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    }
    await this.importLegacy();
    await this.store.exportPendingEvents();
    return this.status();
  }

  registerAgent(input: { agent_id?: string; display_name: string; adapter_type?: string; capabilities?: string[] }) {
    const timestamp = now();
    const agent: AgentProfile = {
      schema_version: SCHEMA_VERSION, agent_id: input.agent_id ?? randomUUID(), display_name: input.display_name,
      adapter_type: input.adapter_type ?? "host", capabilities: input.capabilities ?? [], status: "available",
      created_at: timestamp, updated_at: timestamp,
    };
    this.store.transaction(() => {
      this.store.db.prepare("INSERT INTO agents(agent_id,profile_json,updated_at) VALUES(?,?,?) ON CONFLICT(agent_id) DO UPDATE SET profile_json=excluded.profile_json, updated_at=excluded.updated_at")
        .run(agent.agent_id, JSON.stringify(agent), timestamp);
    });
    return agent;
  }

  createSession(agentId: string, ttlSeconds = 3600) {
    this.requireAgent(agentId);
    const issued = now();
    const session: AgentSession = {
      schema_version: SCHEMA_VERSION, session_id: randomUUID(), agent_id: agentId, issued_at: issued,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(), status: "active",
    };
    this.store.transaction(() => this.store.db.prepare("INSERT INTO sessions(session_id,agent_id,issued_at,expires_at,status) VALUES(?,?,?,?,?)")
      .run(session.session_id, agentId, issued, session.expires_at, session.status));
    return session;
  }

  async plan(manifestPath: string) {
    const absolute = path.resolve(this.workspaceRoot, manifestPath);
    const manifest = YAML.parse(await fsp.readFile(absolute, "utf8")) as PlanManifest;
    if (!manifest?.tasks?.length) throw new Error("manifest must contain at least one task");
    const taskIds = new Set(manifest.tasks.map((task) => task.id));
    if (taskIds.size !== manifest.tasks.length || taskIds.has("")) throw new Error("task ids must be non-empty and unique");
    for (const task of manifest.tasks) for (const dep of task.depends_on ?? []) if (!taskIds.has(dep)) throw new Error(`task ${task.id} depends on unknown task ${dep}`);
    const levels = this.topologicalLevels(manifest);
    const repositoryFiles = listRepositoryFiles(this.workspaceRoot);
    const baseCommit = resolveCommit(this.workspaceRoot);
    const taskToAssignment = new Map<string, string>();
    const assignments: TaskAssignment[] = [];
    for (const [levelIndex, tasks] of levels.entries()) {
      const sprintGroups: typeof tasks[] = [];
      for (const task of tasks) {
        const rawWrites = task.write_scopes ?? task.scope ?? [];
        if (!rawWrites.length) throw new Error(`task ${task.id} has no write scope`);
        const writeScopes = rawWrites.map((scope) => normalizeScope(scope));
        const readScopes = (task.read_scopes ?? writeScopes).map((scope) => normalizeScope(scope, true));
        let group = sprintGroups.find((candidate) => candidate.every((other) => !anyScopeOverlap(writeScopes, (other.write_scopes ?? other.scope ?? []).map((scope) => normalizeScope(scope)), repositoryFiles)));
        if (!group) { group = []; sprintGroups.push(group); }
        group.push(task);
        const existingRow = this.store.db.prepare("SELECT assignment_id,assignment_json FROM assignments WHERE task_id=? AND status='planned' ORDER BY created_at DESC LIMIT 1").get(task.id) as Row | undefined;
        const existing = existingRow ? parseJson<TaskAssignment>(existingRow.assignment_json) : null;
        const assignmentId = existing?.base_commit === baseCommit ? String(existingRow!.assignment_id) : randomUUID();
        taskToAssignment.set(task.id, assignmentId);
        assignments.push({
          schema_version: SCHEMA_VERSION, assignment_id: assignmentId, task_id: task.id,
          sprint_id: `sprint-${levelIndex + sprintGroups.indexOf(group) + 1}`,
          title: task.title ?? task.name ?? task.id, goal: task.goal ?? task.title ?? task.name ?? task.id,
          dependencies: task.depends_on ?? [], read_scopes: readScopes, write_scopes: writeScopes,
          acceptance_criteria: task.acceptance_criteria ?? [], required_capabilities: task.required_capabilities ?? [],
          gates: (task.gates ?? []).map((gate) => ({ ...gate, required: gate.required !== false })), base_commit: baseCommit,
          assigned_agent_id: task.agent_id ?? "unassigned", reviewer_agent_id: task.reviewer_agent_id ?? "unassigned",
          created_at: now(),
        });
      }
    }
    this.store.transaction(() => {
      const insert = this.store.db.prepare("INSERT INTO assignments(assignment_id,task_id,sprint_id,assignment_json,status,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(assignment_id) DO UPDATE SET sprint_id=excluded.sprint_id,assignment_json=excluded.assignment_json");
      for (const assignment of assignments) insert.run(assignment.assignment_id, assignment.task_id, assignment.sprint_id, JSON.stringify(assignment), "planned", assignment.created_at);
    });
    await this.writePlanViews(assignments);
    return { base_commit: baseCommit, assignments, dependency_assignments: Object.fromEntries(taskToAssignment) };
  }

  async run(assignmentId: string, sessionId: string, adapterOverride?: Partial<AdapterConfig>) {
    const assignment = this.assignment(assignmentId);
    if (assignment.assigned_agent_id === "unassigned") throw new Error("assignment must name an agent before execution");
    const session = this.requireActiveSession(sessionId, assignment.assigned_agent_id);
    const worker = this.requireAgent(assignment.assigned_agent_id);
    const missingCapabilities = assignment.required_capabilities.filter((capability) => !worker.capabilities.includes(capability));
    if (missingCapabilities.length) throw new Error(`agent ${worker.agent_id} lacks required capabilities: ${missingCapabilities.join(", ")}`);
    this.requireAgent(assignment.reviewer_agent_id);
    if (assignment.reviewer_agent_id === assignment.assigned_agent_id) throw new Error("reviewer must be a different agent");
    for (const dependency of assignment.dependencies) {
      const row = this.store.db.prepare("SELECT e.state FROM assignments a LEFT JOIN executions e ON e.assignment_id=a.assignment_id WHERE a.task_id=? ORDER BY e.updated_at DESC LIMIT 1").get(dependency) as Row | undefined;
      if (row?.state !== "accepted") throw new Error(`dependency ${dependency} is not accepted`);
    }
    assertCleanWorkspace(this.workspaceRoot);
    const repositoryFiles = listRepositoryFiles(this.workspaceRoot);
    const executionId = randomUUID();
    const timestamp = now();
    this.store.transaction(() => {
      const active = this.store.db.prepare("SELECT scope FROM scope_leases WHERE released_at IS NULL AND expires_at>?").all(timestamp) as Row[];
      const held = active.map((row) => String(row.scope));
      if (anyScopeOverlap(assignment.write_scopes, held, repositoryFiles)) throw new Error("write scopes conflict with an active lease");
      this.store.db.prepare(`INSERT INTO executions(execution_id,assignment_id,worker_agent_id,worker_session_id,state,updated_at)
        VALUES(?,?,?,?,?,?)`).run(executionId, assignmentId, assignment.assigned_agent_id, session.session_id, "queued", timestamp);
      const lease = this.store.db.prepare("INSERT INTO scope_leases(lease_id,assignment_id,execution_id,scope,acquired_at,expires_at) VALUES(?,?,?,?,?,?)");
      for (const scope of assignment.write_scopes) lease.run(randomUUID(), assignmentId, executionId, scope, timestamp, session.expires_at);
      this.appendEvent(executionId, assignment, session, "execution_queued", { write_scopes: assignment.write_scopes });
    });

    try {
      this.changeState(executionId, assignment, session, "preparing");
      const { worktreePath, branchName } = await createExecutionWorktree(this.workspaceRoot, executionId, assignment.task_id, assignment.base_commit, this.store.setting("branch_prefix", "feat/sprint"));
      this.store.transaction(() => this.store.db.prepare("UPDATE executions SET worktree_path=?,branch_name=?,started_at=?,updated_at=? WHERE execution_id=?")
        .run(worktreePath, branchName, now(), now(), executionId));
      this.changeState(executionId, assignment, session, "running");
      const config = { ...(await this.adapterConfig()), ...adapterOverride } as AdapterConfig;
      const result = await runAdapter(config, assignment, worktreePath, (pid) => {
        this.store.transaction(() => this.store.db.prepare("UPDATE executions SET pid=?,updated_at=? WHERE execution_id=?").run(pid, now(), executionId));
      });
      const artifactRoot = path.join(this.store.root, "artifacts", executionId);
      await fsp.mkdir(artifactRoot, { recursive: true });
      const stdoutPath = path.join(artifactRoot, "adapter.stdout.log");
      const stderrPath = path.join(artifactRoot, "adapter.stderr.log");
      await Promise.all([fsp.writeFile(stdoutPath, result.stdout, "utf8"), fsp.writeFile(stderrPath, result.stderr, "utf8")]);
      await fsp.writeFile(path.join(artifactRoot, "adapter-result.json"), `${JSON.stringify({ status: result.status, exit_code: result.exitCode, pid: result.pid, duration_ms: result.durationMs, termination_reason: result.terminationReason, failure_code: result.failureCode, reported_result: result.result }, null, 2)}\n`, "utf8");
      if (this.execution(executionId).state === "cancelled") return this.execution(executionId);
      if (result.status !== "completed") {
        const gitEvidence = await collectGitEvidence(worktreePath, assignment.base_commit, artifactRoot);
        const outOfScope = filesOutsideScopes(gitEvidence.changedFiles, assignment.write_scopes);
        const evidence: VerificationEvidence = {
          schema_version: SCHEMA_VERSION, evidence_id: randomUUID(), execution_id: executionId,
          scope_passed: outOfScope.length === 0, changed_files: gitEvidence.changedFiles, out_of_scope_files: outOfScope, gates: [],
          router_report: { reported_result: result.result, duration_ms: result.durationMs, termination_reason: result.terminationReason, exit_code: result.exitCode }, created_at: now(),
        };
        const artifact = { schema_version: SCHEMA_VERSION, execution_id: executionId, base_commit: assignment.base_commit, head_commit: gitEvidence.headCommit, tree_id: gitEvidence.resultingTree, changed_files: gitEvidence.changedFiles, name_status: gitEvidence.nameStatus, patch_path: gitEvidence.patchPath, stdout_path: stdoutPath, stderr_path: stderrPath, created_at: now() };
        await fsp.writeFile(path.join(artifactRoot, "artifact-manifest.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
        this.store.transaction(() => {
          this.store.db.prepare("INSERT INTO evidence(evidence_id,execution_id,evidence_json,created_at) VALUES(?,?,?,?)").run(evidence.evidence_id, executionId, JSON.stringify(evidence), evidence.created_at);
          this.appendEvent(executionId, assignment, session, "partial_execution_evidence", { evidence_id: evidence.evidence_id, termination_reason: result.terminationReason });
        });
        if (outOfScope.length) this.finding(executionId, "high", "scope_violation", `partial adapter execution changed out-of-scope files: ${outOfScope.join(", ")}`);
        else this.finding(executionId, "high", "adapter_failure", `adapter failed: ${result.failureCode ?? result.status}`);
        this.changeState(executionId, assignment, session, "failed", outOfScope.length ? "scope_violation" : result.failureCode ?? result.status);
        return this.execution(executionId);
      }
      this.changeState(executionId, assignment, session, "verifying");
      const gitEvidence = await collectGitEvidence(worktreePath, assignment.base_commit, artifactRoot);
      const outOfScope = filesOutsideScopes(gitEvidence.changedFiles, assignment.write_scopes);
      const gates = await runGates(worktreePath, assignment.gates, artifactRoot);
      const verificationPassed = outOfScope.length === 0 && !gates.some((gate) => gate.required && !gate.passed);
      const resultingCommit = verificationPassed ? commitExecutionChanges(worktreePath, `agent-synthetix: ${assignment.task_id}`) : gitEvidence.headCommit;
      const evidence: VerificationEvidence = {
        schema_version: SCHEMA_VERSION, evidence_id: randomUUID(), execution_id: executionId,
        scope_passed: outOfScope.length === 0, changed_files: gitEvidence.changedFiles, out_of_scope_files: outOfScope,
        gates, router_report: { reported_result: result.result, duration_ms: result.durationMs, termination_reason: result.terminationReason, exit_code: result.exitCode }, created_at: now(),
      };
      const artifact = {
        schema_version: SCHEMA_VERSION, execution_id: executionId, base_commit: assignment.base_commit,
        head_commit: resultingCommit, tree_id: gitEvidence.resultingTree, changed_files: gitEvidence.changedFiles, name_status: gitEvidence.nameStatus,
        patch_path: gitEvidence.patchPath, stdout_path: stdoutPath, stderr_path: stderrPath, created_at: now(),
      };
      await fsp.writeFile(path.join(artifactRoot, "artifact-manifest.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
      this.store.transaction(() => {
        this.store.db.prepare("INSERT INTO evidence(evidence_id,execution_id,evidence_json,created_at) VALUES(?,?,?,?)")
          .run(evidence.evidence_id, executionId, JSON.stringify(evidence), evidence.created_at);
        this.appendEvent(executionId, assignment, session, "verification_recorded", { evidence_id: evidence.evidence_id, scope_passed: evidence.scope_passed });
      });
      if (outOfScope.length) {
        this.finding(executionId, "high", "scope_violation", `out-of-scope files: ${outOfScope.join(", ")}`);
        this.changeState(executionId, assignment, session, "failed", "scope_violation");
        return this.execution(executionId);
      }
      if (gates.some((gate) => gate.required && !gate.passed)) {
        this.finding(executionId, "high", "gate_failure", "one or more required gates failed");
        this.changeState(executionId, assignment, session, "failed", "gate_failure");
        return this.execution(executionId);
      }
      const request = await this.createReviewRequest(executionId, assignment, session, evidence.evidence_id);
      this.changeState(executionId, assignment, session, "awaiting_review", null, { review_id: request.review_id });
      return this.execution(executionId);
    } catch (error) {
      const current = this.execution(executionId);
      if (!TERMINAL_STATES.has(current.state)) {
        this.finding(executionId, "high", "execution_failure", error instanceof Error ? error.message : String(error));
        this.changeState(executionId, assignment, session, "failed", "execution_failure");
      }
      throw error;
    } finally {
      await this.store.exportPendingEvents();
    }
  }

  async ingestVerdict(value: unknown) {
    const verdict = parseReviewVerdict(value);
    const reviewRow = this.store.db.prepare("SELECT * FROM reviews WHERE review_id=?").get(verdict.review_id) as Row | undefined;
    if (!reviewRow) return this.rejectVerdict(verdict, "unknown_review", "verdict references an unknown review");
    const request = parseJson<ReviewRequest>(reviewRow.request_json);
    if (request.execution_id !== verdict.execution_id || request.reviewer_agent_id !== verdict.reviewer_agent_id) return this.rejectVerdict(verdict, "stale_or_wrong_review", "verdict does not match review request");
    if (Date.parse(request.expires_at) <= Date.now()) return this.rejectVerdict(verdict, "stale_review", "review request expired");
    const session = this.requireActiveSession(verdict.reviewer_session_id, verdict.reviewer_agent_id);
    if (request.worker_agent_id === verdict.reviewer_agent_id || request.worker_session_id === verdict.reviewer_session_id) return this.rejectVerdict(verdict, "self_review", "worker cannot review its own execution");
    const execution = this.execution(verdict.execution_id);
    if (execution.state !== "awaiting_review") return this.rejectVerdict(verdict, "illegal_review_state", `execution is ${execution.state}`);
    const evidence = this.store.db.prepare("SELECT evidence_id,evidence_json FROM evidence WHERE execution_id=? ORDER BY created_at DESC LIMIT 1").get(verdict.execution_id) as Row | undefined;
    if (!evidence || !verdict.evidence_refs.includes(String(evidence.evidence_id))) return this.rejectVerdict(verdict, "missing_evidence", "verdict must reference current verification evidence");
    const assignment = this.assignment(execution.assignment_id);
    const target: ExecutionState = verdict.verdict === "approve" ? "accepted" : verdict.verdict === "request_changes" ? "changes_requested" : "rejected";
    this.store.transaction(() => {
      const inserted = this.store.insertEvent({ schema_version: SCHEMA_VERSION, event_id: verdict.event_id, event_type: "review_verdict", execution_id: verdict.execution_id, assignment_id: assignment.assignment_id, agent_id: verdict.reviewer_agent_id, session_id: session.session_id, occurred_at: verdict.occurred_at, payload: { verdict: verdict.verdict, review_id: verdict.review_id } });
      if (!inserted) return;
      this.store.db.prepare("UPDATE reviews SET verdict_json=?,status=?,updated_at=? WHERE review_id=?").run(JSON.stringify(verdict), verdict.verdict, now(), verdict.review_id);
      this.transitionChecked(execution, target, verdict.event_id);
      if (TERMINAL_STATES.has(target)) this.releaseLeases(verdict.execution_id);
    });
    await this.store.exportPendingEvents();
    await this.refreshSprintStatuses();
    await this.writeStatusViews();
    return this.execution(verdict.execution_id);
  }

  async ingestEvent(value: unknown) {
    const event = parseExecutionEvent(value);
    this.requireActiveSession(event.session_id, event.agent_id);
    const execution = this.execution(event.execution_id);
    if (execution.assignment_id !== event.assignment_id || execution.worker_agent_id !== event.agent_id || execution.worker_session_id !== event.session_id) {
      this.finding(event.execution_id, "high", "event_identity_mismatch", "event identity does not own the execution");
      throw new Error("event identity does not own the execution");
    }
    if (execution.started_at && Date.parse(event.occurred_at) < Date.parse(execution.started_at)) {
      this.finding(event.execution_id, "medium", "stale_event", "event predates execution start");
      throw new Error("stale event predates execution start");
    }
    if (["execution_state_changed", "verification_recorded", "review_verdict"].includes(event.event_type)) {
      this.finding(event.execution_id, "high", "reserved_event", `external event cannot claim ${event.event_type}`);
      throw new Error(`event type ${event.event_type} is kernel-reserved`);
    }
    const inserted = this.store.transaction(() => this.store.insertEvent(event));
    await this.store.exportPendingEvents();
    return { accepted: inserted, duplicate: !inserted };
  }

  async ingest() {
    const inboxRoot = path.join(this.store.root, "comms", "inboxes");
    await fsp.mkdir(inboxRoot, { recursive: true });
    const agents = await fsp.readdir(inboxRoot, { withFileTypes: true });
    let accepted = 0; let rejected = 0;
    for (const agent of agents.filter((entry) => entry.isDirectory())) {
      const dir = path.join(inboxRoot, agent.name);
      for (const file of (await fsp.readdir(dir)).filter((name) => name.endsWith(".verdict.json"))) {
        const source = path.join(dir, file);
        try {
          await this.ingestVerdict(JSON.parse(await fsp.readFile(source, "utf8")));
          await fsp.rename(source, path.join(dir, file.replace(".verdict.json", ".processed.json")));
          accepted++;
        } catch (error) {
          this.finding(null, "medium", "malformed_verdict", `${file}: ${error instanceof Error ? error.message : String(error)}`);
          rejected++;
        }
      }
    }
    return { accepted, rejected };
  }

  cancel(executionId: string) {
    const execution = this.execution(executionId);
    if (TERMINAL_STATES.has(execution.state)) return execution;
    if (execution.pid) {
      try {
        process.kill(execution.pid, "SIGTERM");
        setTimeout(() => {
          try { process.kill(execution.pid!, 0); process.kill(execution.pid!, "SIGKILL"); } catch { /* exited during grace */ }
        }, 5_000).unref();
      } catch { /* already exited */ }
    }
    const assignment = this.assignment(execution.assignment_id);
    const session = this.requireSession(execution.worker_session_id);
    this.changeState(executionId, assignment, session, "cancelled", "cancelled");
    return this.execution(executionId);
  }

  async retry(executionId: string, sessionId?: string) {
    const previous = this.execution(executionId);
    if (previous.state !== "changes_requested") throw new Error(`execution ${executionId} is not awaiting a changed attempt`);
    const assignment = this.assignment(previous.assignment_id);
    const session = this.requireActiveSession(sessionId ?? previous.worker_session_id, previous.worker_agent_id);
    if (!previous.worktree_path) throw new Error("changed attempt has no retained worktree");
    const nextBase = resolveCommit(previous.worktree_path);
    this.changeState(executionId, assignment, session, "queued", null, { new_attempt: true });
    this.changeState(executionId, assignment, session, "failed", "superseded_attempt");
    const nextAssignment = { ...assignment, base_commit: nextBase, created_at: now() };
    this.store.transaction(() => this.store.db.prepare("UPDATE assignments SET assignment_json=?,status='planned' WHERE assignment_id=?").run(JSON.stringify(nextAssignment), assignment.assignment_id));
    return this.run(assignment.assignment_id, session.session_id);
  }

  cleanup() {
    const expired = this.store.db.prepare("SELECT DISTINCT e.* FROM executions e JOIN scope_leases l ON l.execution_id=e.execution_id WHERE l.released_at IS NULL AND l.expires_at<=? AND e.state IN ('queued','preparing','running','verifying','awaiting_review','changes_requested')").all(now()) as Row[];
    for (const row of expired) {
      const execution = asExecution(row); const assignment = this.assignment(execution.assignment_id); const session = this.requireSession(execution.worker_session_id);
      this.finding(execution.execution_id, "high", "lease_expired", "execution lease expired before terminal completion");
      this.changeState(execution.execution_id, assignment, session, "failed", "lease_expired");
    }
    const rows = this.store.db.prepare("SELECT * FROM executions WHERE worktree_path IS NOT NULL AND state IN ('accepted','rejected','failed','cancelled')").all() as Row[];
    const removed: string[] = []; const unresolved: Array<{ execution_id: string; reason: string }> = [];
    for (const row of rows) {
      const execution = asExecution(row);
      if (!execution.worktree_path) continue;
      try {
        removeExecutionWorktree(this.workspaceRoot, execution.worktree_path);
        this.store.db.prepare("UPDATE executions SET worktree_path=NULL,updated_at=? WHERE execution_id=?").run(now(), execution.execution_id);
        removed.push(execution.execution_id);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        unresolved.push({ execution_id: execution.execution_id, reason });
        this.finding(execution.execution_id, "medium", "cleanup_deferred", "worktree has unresolved state; cleanup was not forced");
      }
    }
    return { removed, unresolved };
  }

  async reconcile() {
    const imported = await this.importLegacy();
    const rows = this.store.db.prepare("SELECT assignment_json FROM assignments").all() as Row[];
    for (const row of rows) {
      const assignment = parseJson<TaskAssignment>(row.assignment_json);
      if (!assignment.write_scopes.length) {
        this.store.setSetting("guard_mode", "report");
        throw new Error(`cannot reconcile assignment ${assignment.assignment_id}: empty write scopes`);
      }
      assignment.write_scopes.forEach((scope) => normalizeScope(scope));
    }
    const executions = this.store.db.prepare("SELECT execution_id,state FROM executions").all() as Row[];
    for (const row of executions) {
      const replayed = this.replayExecution(String(row.execution_id));
      if (replayed !== row.state) {
        this.store.setSetting("guard_mode", "report");
        this.finding(String(row.execution_id), "critical", "projection_mismatch", `event replay produced ${replayed}, projection is ${String(row.state)}`);
        throw new Error(`execution ${String(row.execution_id)} projection does not match event replay`);
      }
    }
    this.store.setSetting("guard_mode", "enforce");
    await this.writeStatusViews();
    return { imported, guard_mode: "enforce" };
  }

  status() {
    const executions = (this.store.db.prepare("SELECT * FROM executions ORDER BY updated_at DESC").all() as Row[]).map(asExecution);
    const assignments = (this.store.db.prepare("SELECT assignment_json,status FROM assignments ORDER BY created_at").all() as Row[]).map((row) => ({ ...parseJson<TaskAssignment>(row.assignment_json), status: row.status }));
    const leases = this.store.db.prepare("SELECT * FROM scope_leases WHERE released_at IS NULL ORDER BY acquired_at").all();
    const findings = this.store.db.prepare("SELECT * FROM findings WHERE status='open' ORDER BY created_at DESC").all();
    const reviews = this.store.db.prepare("SELECT review_id,execution_id,status,request_json,verdict_json FROM reviews ORDER BY created_at DESC").all();
    const evidence = (this.store.db.prepare("SELECT evidence_json FROM evidence ORDER BY created_at DESC").all() as Row[]).map((row) => parseJson<VerificationEvidence>(row.evidence_json));
    const latest = this.store.db.prepare("SELECT occurred_at FROM events ORDER BY seq DESC LIMIT 1").get() as { occurred_at?: string } | undefined;
    const staleExecutions = executions.filter((execution) => !TERMINAL_STATES.has(execution.state) && Date.now() - Date.parse(execution.updated_at) > 5 * 60_000).map((execution) => execution.execution_id);
    return { schema_version: SCHEMA_VERSION, authoritative_store: this.store.dbPath, guard_mode: this.store.setting("guard_mode", "enforce"), updated_at: now(), freshness: { latest_event_at: latest?.occurred_at ?? null, stale_execution_ids: staleExecutions }, assignments, executions, leases, reviews, evidence, findings };
  }

  replayExecution(executionId: string) {
    const rows = this.store.db.prepare("SELECT event_type,payload_json FROM events WHERE execution_id=? ORDER BY seq").all(executionId) as Row[];
    if (!rows.length) throw new Error(`execution ${executionId} has no events to replay`);
    let state: ExecutionState = "queued";
    for (const row of rows) {
      const payload = parseJson<Record<string, unknown>>(row.payload_json);
      if (row.event_type === "execution_state_changed" && payload.to) state = String(payload.to) as ExecutionState;
      if (row.event_type === "review_verdict") state = payload.verdict === "approve" ? "accepted" : payload.verdict === "request_changes" ? "changes_requested" : "rejected";
    }
    return state;
  }

  execution(executionId: string) {
    const row = this.store.db.prepare("SELECT * FROM executions WHERE execution_id=?").get(executionId) as Row | undefined;
    if (!row) throw new Error(`unknown execution ${executionId}`);
    return asExecution(row);
  }

  async recordCommand(command: string, args: Record<string, unknown>, status: "pending" | "processed" | "failed", commandId: string = randomUUID()) {
    const timestamp = now();
    this.store.transaction(() => this.store.db.prepare("INSERT INTO commands(command_id,command,args_json,status,enqueued_at,processed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(command_id) DO UPDATE SET status=excluded.status,processed_at=excluded.processed_at,args_json=excluded.args_json")
      .run(commandId, command, JSON.stringify(args), status, timestamp, status === "pending" ? null : timestamp));
    if (status !== "pending") {
      const processed = path.join(this.store.root, "commands", "processed.jsonl");
      await fsp.mkdir(path.dirname(processed), { recursive: true });
      await fsp.appendFile(processed, `${JSON.stringify({ id: commandId, command, args, status, processed_at: timestamp })}\n`, "utf8");
    }
    return { command_id: commandId, status };
  }

  assignment(assignmentId: string) {
    const row = this.store.db.prepare("SELECT assignment_json FROM assignments WHERE assignment_id=?").get(assignmentId) as Row | undefined;
    if (!row) throw new Error(`unknown assignment ${assignmentId}`);
    return parseJson<TaskAssignment>(row.assignment_json);
  }

  activeSessionForAgent(agentId: string) {
    const row = this.store.db.prepare("SELECT * FROM sessions WHERE agent_id=? AND status='active' AND expires_at>? ORDER BY issued_at DESC LIMIT 1").get(agentId, now()) as Row | undefined;
    if (!row) throw new Error(`no active session for agent ${agentId}; create one first`);
    return { schema_version: SCHEMA_VERSION, ...row } as AgentSession;
  }

  private requireAgent(agentId: string) {
    const row = this.store.db.prepare("SELECT profile_json FROM agents WHERE agent_id=?").get(agentId) as Row | undefined;
    if (!row) throw new Error(`unknown agent ${agentId}`);
    return parseJson<AgentProfile>(row.profile_json);
  }

  private requireSession(sessionId: string) {
    const row = this.store.db.prepare("SELECT * FROM sessions WHERE session_id=?").get(sessionId) as Row | undefined;
    if (!row) throw new Error(`unknown session ${sessionId}`);
    return { schema_version: SCHEMA_VERSION, ...row } as AgentSession;
  }

  private requireActiveSession(sessionId: string, agentId: string) {
    const session = this.requireSession(sessionId);
    if (session.agent_id !== agentId || session.status !== "active" || Date.parse(session.expires_at) <= Date.now()) throw new Error(`session ${sessionId} is unknown, expired, revoked, or belongs to another agent`);
    return session;
  }

  private appendEvent(executionId: string, assignment: TaskAssignment, session: AgentSession, eventType: string, payload: Record<string, unknown>, eventId = randomUUID()) {
    const event: ExecutionEvent = { schema_version: SCHEMA_VERSION, event_id: eventId, event_type: eventType, execution_id: executionId, assignment_id: assignment.assignment_id, agent_id: session.agent_id, session_id: session.session_id, occurred_at: now(), payload };
    return this.store.insertEvent(event);
  }

  private changeState(executionId: string, assignment: TaskAssignment, session: AgentSession, target: ExecutionState, failureCode: string | null = null, payload: Record<string, unknown> = {}) {
    this.store.transaction(() => {
      const execution = this.execution(executionId);
      const eventId = randomUUID();
      this.appendEvent(executionId, assignment, session, "execution_state_changed", { from: execution.state, to: target, ...payload }, eventId);
      this.transitionChecked(execution, target, eventId, failureCode);
      if (TERMINAL_STATES.has(target)) this.releaseLeases(executionId);
    });
  }

  private transitionChecked(execution: ExecutionSummary, target: ExecutionState, _eventId: string, failureCode: string | null = null) {
    if (!STATE_TRANSITIONS[execution.state].includes(target)) throw new Error(`illegal execution transition ${execution.state} -> ${target}`);
    this.store.transition(execution.execution_id, target, { failureCode, completedAt: TERMINAL_STATES.has(target) ? now() : null });
    if (target === "accepted") this.store.db.prepare("UPDATE assignments SET status='accepted' WHERE assignment_id=?").run(execution.assignment_id);
  }

  private releaseLeases(executionId: string) {
    this.store.db.prepare("UPDATE scope_leases SET released_at=? WHERE execution_id=? AND released_at IS NULL").run(now(), executionId);
  }

  private finding(executionId: string | null, severity: GuardFinding["severity"], category: string, message: string) {
    const finding: GuardFinding = { schema_version: SCHEMA_VERSION, finding_id: randomUUID(), execution_id: executionId, severity, category, message, status: "open", created_at: now() };
    this.store.transaction(() => this.store.addFinding(finding));
    return finding;
  }

  private rejectVerdict(verdict: ReviewVerdict, category: string, message: string): never {
    this.finding(verdict.execution_id || null, "high", category, message);
    throw new Error(message);
  }

  private async createReviewRequest(executionId: string, assignment: TaskAssignment, session: AgentSession, evidenceId: string) {
    const request: ReviewRequest = {
      schema_version: SCHEMA_VERSION, review_id: randomUUID(), execution_id: executionId, assignment_id: assignment.assignment_id,
      worker_agent_id: assignment.assigned_agent_id, worker_session_id: session.session_id,
      reviewer_agent_id: assignment.reviewer_agent_id, evidence_id: evidenceId, created_at: now(),
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    };
    this.store.transaction(() => {
      this.store.db.prepare("INSERT INTO reviews(review_id,execution_id,request_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?)")
        .run(request.review_id, executionId, JSON.stringify(request), "pending", request.created_at, request.created_at);
    });
    const inbox = path.join(this.store.root, "comms", "inboxes", assignment.reviewer_agent_id);
    await fsp.mkdir(inbox, { recursive: true });
    await fsp.writeFile(path.join(inbox, `${request.review_id}.request.json`), `${JSON.stringify({ type: "review_request", ...request }, null, 2)}\n`, "utf8");
    return request;
  }

  private topologicalLevels(manifest: PlanManifest) {
    const byId = new Map(manifest.tasks.map((task) => [task.id, task]));
    const remaining = new Map(manifest.tasks.map((task) => [task.id, new Set(task.depends_on ?? [])]));
    const levels: PlanManifest["tasks"][] = [];
    while (remaining.size) {
      const ready = [...remaining.entries()].filter(([, deps]) => deps.size === 0).map(([id]) => id).sort();
      if (!ready.length) throw new Error("manifest dependency graph contains a cycle");
      levels.push(ready.map((id) => byId.get(id)!));
      for (const id of ready) remaining.delete(id);
      for (const deps of remaining.values()) for (const id of ready) deps.delete(id);
    }
    return levels;
  }

  private async adapterConfig() {
    const config = JSON.parse(await fsp.readFile(path.join(this.store.root, "control-plane.config.json"), "utf8")) as AdapterConfig;
    config.router_path = path.resolve(this.workspaceRoot, config.router_path);
    return config;
  }

  private async importLegacy() {
    const importerVersion = "2";
    const forceProjection = this.store.setting("legacy_importer_version", "0") !== importerVersion;
    const candidates = ["registry/agents.yaml", "comms/registry.json", "state.json", "plans/status.yaml", "commands/pending.jsonl"];
    const sprintDir = path.join(this.store.root, "sprints");
    try { candidates.push(...(await fsp.readdir(sprintDir)).filter((name) => name.endsWith(".yaml")).map((name) => `sprints/${name}`)); } catch { /* first init */ }
    let imported = 0;
    for (const relative of candidates) {
      const source = path.join(this.store.root, relative);
      try {
        const contents = await fsp.readFile(source, "utf8");
        const changed = this.store.importHash(relative, contents);
        if (!changed && !forceProjection) continue;
        imported++;
        if (relative === "comms/registry.json") this.importLegacyRegistry(JSON.parse(contents) as { agents?: Array<Record<string, unknown>> });
        if (relative === "state.json") this.importLegacyState(JSON.parse(contents) as { agents?: Record<string, unknown> });
        if (relative === "commands/pending.jsonl") this.importLegacyCommands(contents);
        if (/^sprints\/sprint-\d+\.yaml$/.test(relative)) this.importLegacySprint(relative, YAML.parse(contents) as Record<string, unknown>);
      } catch { /* absent compatibility source */ }
    }
    this.store.setSetting("legacy_importer_version", importerVersion);
    if (imported && this.store.db.prepare("SELECT COUNT(*) AS count FROM executions").get()?.count === 0) this.store.setSetting("guard_mode", "report");
    return imported;
  }

  private importLegacyRegistry(registry: { agents?: Array<Record<string, unknown>> }) {
    const timestamp = now();
    const statement = this.store.db.prepare("INSERT OR IGNORE INTO agents(agent_id,profile_json,updated_at) VALUES(?,?,?)");
    for (const row of registry.agents ?? []) {
      const agentId = String(row.id ?? ""); if (!agentId) continue;
      const profile: AgentProfile = { schema_version: SCHEMA_VERSION, agent_id: agentId, display_name: String(row.name ?? agentId), adapter_type: String(row.loop_mechanism ?? "legacy-file-bus"), capabilities: [], status: "offline", created_at: timestamp, updated_at: timestamp };
      statement.run(agentId, JSON.stringify(profile), timestamp);
    }
  }

  private importLegacyState(state: { agents?: Record<string, unknown> }) {
    const timestamp = now();
    const statement = this.store.db.prepare("INSERT OR IGNORE INTO agents(agent_id,profile_json,updated_at) VALUES(?,?,?)");
    for (const agentId of Object.keys(state.agents ?? {})) {
      const profile: AgentProfile = { schema_version: SCHEMA_VERSION, agent_id: agentId, display_name: agentId, adapter_type: "legacy-worker", capabilities: [], status: "offline", created_at: timestamp, updated_at: timestamp };
      statement.run(agentId, JSON.stringify(profile), timestamp);
    }
  }

  private importLegacyCommands(contents: string) {
    const statement = this.store.db.prepare("INSERT OR IGNORE INTO commands(command_id,command,args_json,status,enqueued_at) VALUES(?,?,?,?,?)");
    for (const line of contents.split("\n").filter(Boolean)) {
      try {
        const row = JSON.parse(line) as Record<string, unknown>;
        statement.run(String(row.id ?? randomUUID()), String(row.command ?? "unknown"), JSON.stringify(row.args ?? {}), "pending", String(row.enqueued_at ?? now()));
      } catch { this.finding(null, "medium", "legacy_import", "ignored malformed pending command line"); }
    }
  }

  private importLegacySprint(relative: string, sprint: Record<string, unknown>) {
    const sprintId = `sprint-${String(sprint.sprint ?? path.basename(relative).match(/\d+/)?.[0] ?? "legacy")}`;
    const statement = this.store.db.prepare("INSERT OR IGNORE INTO assignments(assignment_id,task_id,sprint_id,assignment_json,status,created_at) VALUES(?,?,?,?,?,?)");
    for (const group of (Array.isArray(sprint.assignments) ? sprint.assignments : []) as Array<Record<string, unknown>>) {
      const scopes = (Array.isArray(group.scope) ? group.scope : []).map(String);
      for (const task of (Array.isArray(group.tasks) ? group.tasks : []) as Array<Record<string, unknown>>) {
        const taskId = String(task.id ?? randomUUID()); const created = now();
        const assignment: TaskAssignment = {
          schema_version: SCHEMA_VERSION, assignment_id: `legacy:${sprintId}:${taskId}`, task_id: taskId, sprint_id: sprintId,
          title: String(task.name ?? taskId), goal: String(task.name ?? taskId), dependencies: [], read_scopes: scopes,
          write_scopes: scopes, acceptance_criteria: [], required_capabilities: [], gates: [], base_commit: resolveCommit(this.workspaceRoot),
          assigned_agent_id: String(group.agent ?? "unassigned"), reviewer_agent_id: "unassigned", created_at: created,
        };
        statement.run(assignment.assignment_id, taskId, sprintId, JSON.stringify(assignment), "legacy", created);
      }
    }
  }

  private async writePlanViews(assignments: TaskAssignment[]) {
    const bySprint = new Map<string, TaskAssignment[]>();
    for (const assignment of assignments) {
      const key = assignment.sprint_id ?? "sprint-unassigned";
      bySprint.set(key, [...(bySprint.get(key) ?? []), assignment]);
    }
    for (const [sprint, rows] of bySprint) await fsp.writeFile(path.join(this.store.root, "sprints", `${sprint}.yaml`), YAML.stringify({ id: sprint, status: "planned", assignments: rows }), "utf8");
    const summary = { generated_at: now(), authoritative_store: "control-plane.db", sprints: [...bySprint].map(([id, rows]) => ({ id, assignments: rows.length })) };
    await Promise.all([
      fsp.writeFile(path.join(this.store.root, "sprints", "plan-summary.yaml"), YAML.stringify(summary), "utf8"),
      fsp.writeFile(path.join(this.store.root, "sprints", "plan-summary.md"), `# Plan summary\n\n${assignments.length} assignments across ${bySprint.size} sprints.\n`, "utf8"),
    ]);
    await this.writeStatusViews();
  }

  private async writeStatusViews() {
    const status = this.status();
    await fsp.mkdir(path.join(this.store.root, "plans"), { recursive: true });
    await Promise.all([
      fsp.writeFile(path.join(this.store.root, "plans", "status.json"), `${JSON.stringify(status, null, 2)}\n`, "utf8"),
      fsp.writeFile(path.join(this.store.root, "plans", "status.yaml"), YAML.stringify({ guard_mode: status.guard_mode, assignments: status.assignments.length, executions: status.executions.map((item) => ({ id: item.execution_id, state: item.state })) }), "utf8"),
    ]);
  }

  private async refreshSprintStatuses() {
    const rows = this.store.db.prepare("SELECT sprint_id,assignment_json,status FROM assignments WHERE sprint_id IS NOT NULL AND status!='legacy' ORDER BY created_at").all() as Row[];
    const grouped = new Map<string, Array<{ assignment: TaskAssignment; status: string }>>();
    for (const row of rows) {
      const sprintId = String(row.sprint_id);
      grouped.set(sprintId, [...(grouped.get(sprintId) ?? []), { assignment: parseJson<TaskAssignment>(row.assignment_json), status: String(row.status) }]);
    }
    for (const [sprintId, entries] of grouped) {
      const sprintStatus = entries.every((entry) => entry.status === "accepted") ? "approved" : "planned";
      await fsp.writeFile(path.join(this.store.root, "sprints", `${sprintId}.yaml`), YAML.stringify({ id: sprintId, status: sprintStatus, assignments: entries.map((entry) => ({ ...entry.assignment, status: entry.status })) }), "utf8");
    }
  }
}
