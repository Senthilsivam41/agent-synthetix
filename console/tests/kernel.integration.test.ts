import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION } from "../plugins/control-plane/contracts";
import { hermesFixtureConfig } from "../plugins/control-plane/hermes-adapter";
import { ControlPlaneKernel } from "../plugins/control-plane/kernel";
import type { GitHubIssue } from "../plugins/control-plane/github-issues";
import YAML from "yaml";

const roots: string[] = [];
function git(root: string, args: string[]) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }

async function repository(tasks: unknown[]) {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-kernel-")); roots.push(base);
  const root = path.join(base, "repo"); await fsp.mkdir(root);
  git(root, ["init", "-b", "main"]); git(root, ["config", "user.name", "Test"]); git(root, ["config", "user.email", "test@example.com"]);
  await fsp.writeFile(path.join(root, ".gitignore"), ".autoclaw/\n", "utf8");
  await fsp.mkdir(path.join(root, "src")); await fsp.writeFile(path.join(root, "src", "base.txt"), "base\n", "utf8");
  const manifest = `tasks:\n${tasks.map((task) => `  - ${JSON.stringify(task)}`).join("\n")}\n`;
  await fsp.writeFile(path.join(root, "manifest.yaml"), manifest, "utf8");
  git(root, ["add", "."]); git(root, ["commit", "-m", "fixture"]);
  return root;
}

afterEach(async () => {
  delete process.env.HERMES_FIXTURE_MODE;
  delete process.env.HERMES_FIXTURE_WRITES;
  for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true });
});

describe("control-plane vertical slice", () => {
  it("runs disjoint assignments without overlapping leases", async () => {
    const root = await repository([
      { id: "left", write_scopes: ["src/left/**"], agent_id: "left-agent", reviewer_agent_id: "reviewer" },
      { id: "right", write_scopes: ["src/right/**"], agent_id: "right-agent", reviewer_agent_id: "reviewer" },
    ]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAgent({ agent_id: "left-agent", display_name: "Left" }); kernel.registerAgent({ agent_id: "right-agent", display_name: "Right" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const leftSession = kernel.createSession("left-agent"); const rightSession = kernel.createSession("right-agent");
    const planned = await kernel.plan("manifest.yaml");
    const [left, right] = await Promise.all([
      kernel.run(planned.assignments[0]!.assignment_id, leftSession.session_id, { mode: "mock", mock_changes: { "src/left/result.txt": "left\n" } }),
      kernel.run(planned.assignments[1]!.assignment_id, rightSession.session_id, { mode: "mock", mock_changes: { "src/right/result.txt": "right\n" } }),
    ]);
    expect([left.state, right.state]).toEqual(["awaiting_review", "awaiting_review"]);
    expect(kernel.status().leases).toHaveLength(2);
    kernel.close();
  });

  it("requires deterministic evidence and an independent reviewer before acceptance", async () => {
    const root = await repository([{ id: "task-a", title: "Change source", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer", gates: [{ name: "exists", command: "test -f src/result.txt", required: true }] }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker"); const reviewer = kernel.createSession("reviewer");
    const planned = await kernel.plan("manifest.yaml");
    const execution = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, { mode: "mock", mock_changes: { "src/result.txt": "done\n" } });
    expect(execution.state).toBe("awaiting_review");
    const review = kernel.status().reviews[0] as { review_id: string };
    const evidence = kernel.store.db.prepare("SELECT evidence_id FROM evidence WHERE execution_id=?").get(execution.execution_id) as { evidence_id: string };
    await expect(kernel.ingestVerdict({ schema_version: SCHEMA_VERSION, event_id: crypto.randomUUID(), review_id: review.review_id, execution_id: execution.execution_id, reviewer_agent_id: "worker", reviewer_session_id: worker.session_id, verdict: "approve", comments: "self", evidence_refs: [evidence.evidence_id], occurred_at: new Date().toISOString() })).rejects.toThrow();
    const requested = await kernel.ingestVerdict({ schema_version: SCHEMA_VERSION, event_id: crypto.randomUUID(), review_id: review.review_id, execution_id: execution.execution_id, reviewer_agent_id: "reviewer", reviewer_session_id: reviewer.session_id, verdict: "request_changes", comments: "revise", evidence_refs: [evidence.evidence_id], occurred_at: new Date().toISOString() });
    expect(requested.state).toBe("changes_requested");
    const retried = await kernel.retry(execution.execution_id, worker.session_id);
    expect(retried.state).toBe("awaiting_review");
    const nextReview = kernel.status().reviews.find((item) => String(item.execution_id) === retried.execution_id) as { review_id: string };
    const nextEvidence = kernel.store.db.prepare("SELECT evidence_id FROM evidence WHERE execution_id=?").get(retried.execution_id) as { evidence_id: string };
    const accepted = await kernel.ingestVerdict({ schema_version: SCHEMA_VERSION, event_id: crypto.randomUUID(), review_id: nextReview.review_id, execution_id: retried.execution_id, reviewer_agent_id: "reviewer", reviewer_session_id: reviewer.session_id, verdict: "approve", comments: "verified", evidence_refs: [nextEvidence.evidence_id], occurred_at: new Date().toISOString() });
    expect(accepted.state).toBe("accepted");
    expect(kernel.replayExecution(retried.execution_id)).toBe("accepted");
    expect(kernel.status().leases).toHaveLength(0);
    kernel.close();
  });

  it("blocks an overlapping lease and rejects an out-of-scope diff", async () => {
    const root = await repository([
      { id: "one", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer" },
      { id: "two", write_scopes: ["src/base.txt"], agent_id: "worker", reviewer_agent_id: "reviewer" },
      { id: "three", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer" },
    ]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker"); kernel.createSession("reviewer");
    const planned = await kernel.plan("manifest.yaml");
    const first = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, { mode: "mock" });
    expect(first.state).toBe("awaiting_review");
    await expect(kernel.run(planned.assignments[1]!.assignment_id, worker.session_id, { mode: "mock" })).rejects.toThrow(/active lease/);
    kernel.cancel(first.execution_id);
    const violation = await kernel.run(planned.assignments[2]!.assignment_id, worker.session_id, { mode: "mock", mock_changes: { "docs/oops.md": "outside\n" } });
    expect(violation.state).toBe("failed"); expect(violation.failure_code).toBe("scope_violation");
    expect(kernel.status().findings.some((finding) => String(finding.category) === "scope_violation")).toBe(true);
    kernel.close();
  });

  it("requires a fresh registered adapter capability for capability-constrained work", async () => {
    const root = await repository([{ id: "capability-task", write_scopes: ["src/**"], required_capabilities: ["special-tool"], agent_id: "worker", reviewer_agent_id: "reviewer" }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAdapter({ adapter_type: "fixture", display_name: "Fixture", version: "1", capabilities: ["special-tool"] });
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker", adapter_type: "fixture" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker");
    const planned = await kernel.plan("manifest.yaml");
    const execution = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, { mode: "mock", mock_changes: { "src/capability.txt": "ok\n" } });
    expect(execution.state).toBe("awaiting_review");
    kernel.close();
  });

  it("fails closed when a required adapter capability snapshot is stale", async () => {
    const root = await repository([{ id: "stale-task", write_scopes: ["src/**"], required_capabilities: ["special-tool"], agent_id: "worker", reviewer_agent_id: "reviewer" }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAdapter({ adapter_type: "stale-fixture", display_name: "Stale fixture", version: "1", capabilities: ["special-tool"], ttl_seconds: -1 });
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker", adapter_type: "stale-fixture" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker");
    const planned = await kernel.plan("manifest.yaml");
    await expect(kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, { mode: "mock" })).rejects.toThrow(/capability snapshot is stale/);
    kernel.close();
  });
});

describe("Hermes Agent kernel vertical slice", () => {
  function fixtureOverride(mode: string, writes: Record<string, string> = {}, timeoutMs = 5_000) {
    process.env.HERMES_FIXTURE_MODE = mode;
    process.env.HERMES_FIXTURE_WRITES = JSON.stringify(writes);
    return hermesFixtureConfig({ timeout_ms: timeoutMs, termination_grace_ms: 50 });
  }

  it("accepts in-scope fixture work only after independent review and preserves external-run correlation", async () => {
    const root = await repository([{ id: "task-a", title: "Change source", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer", gates: [{ name: "exists", command: "test -f src/result.txt", required: true }] }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker"); const reviewer = kernel.createSession("reviewer");
    const planned = await kernel.plan("manifest.yaml");
    const execution = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, fixtureOverride("success", { "src/result.txt": "done\n" }));
    expect(execution.state).toBe("awaiting_review");
    const contractPath = path.join(root, ".autoclaw", "orchestrator", "artifacts", execution.execution_id, "hermes-completion-contract.json");
    expect(JSON.parse(await fsp.readFile(contractPath, "utf8")).assignment_id).toBe(planned.assignments[0]!.assignment_id);
    const external = JSON.parse(String(kernel.store.externalRunForExecution(execution.execution_id)?.record_json));
    expect(external.external_run_id).toBe("ext-run-fixture");
    expect(external.external_session_id).toBe("ext-session-fixture");
    const review = kernel.status().reviews[0] as { review_id: string };
    const evidence = kernel.store.db.prepare("SELECT evidence_id FROM evidence WHERE execution_id=?").get(execution.execution_id) as { evidence_id: string };
    await expect(kernel.ingestVerdict({ schema_version: SCHEMA_VERSION, event_id: crypto.randomUUID(), review_id: review.review_id, execution_id: execution.execution_id, reviewer_agent_id: "worker", reviewer_session_id: worker.session_id, verdict: "approve", comments: "self", evidence_refs: [evidence.evidence_id], occurred_at: new Date().toISOString() })).rejects.toThrow();
    const accepted = await kernel.ingestVerdict({ schema_version: SCHEMA_VERSION, event_id: crypto.randomUUID(), review_id: review.review_id, execution_id: execution.execution_id, reviewer_agent_id: "reviewer", reviewer_session_id: reviewer.session_id, verdict: "approve", comments: "verified", evidence_refs: [evidence.evidence_id], occurred_at: new Date().toISOString() });
    expect(accepted.state).toBe("accepted");
    await kernel.reconcile();
    expect(JSON.parse(String(kernel.store.externalRunForExecution(execution.execution_id)?.record_json)).external_run_id).toBe("ext-run-fixture");
    expect(kernel.replayExecution(execution.execution_id)).toBe("accepted");
    kernel.close();
  });

  it("fails out-of-scope fixture writes even when the worker reports completed", async () => {
    const root = await repository([{ id: "task-a", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer" }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker");
    const planned = await kernel.plan("manifest.yaml");
    const violation = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, fixtureOverride("success", { "docs/oops.md": "outside\n" }));
    expect(violation.state).toBe("failed");
    expect(violation.failure_code).toBe("scope_violation");
    kernel.close();
  });

  it("preserves partial evidence after a fixture crash", async () => {
    const root = await repository([{ id: "task-a", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer" }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker");
    const planned = await kernel.plan("manifest.yaml");
    const crashed = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, fixtureOverride("crash"));
    expect(crashed.state).toBe("failed");
    expect(crashed.failure_code).toBe("process_failure");
    const evidence = kernel.store.db.prepare("SELECT evidence_json FROM evidence WHERE execution_id=?").get(crashed.execution_id) as { evidence_json: string };
    expect(JSON.parse(evidence.evidence_json).router_report.termination_reason).toBe("process_failure");
    expect(kernel.store.externalRunForExecution(crashed.execution_id)?.record_json).toBeTruthy();
    kernel.close();
  });

  it("preserves partial evidence when an in-flight Hermes run is cancelled", async () => {
    const root = await repository([{ id: "task-a", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer" }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker");
    const planned = await kernel.plan("manifest.yaml");
    const pending = kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, fixtureOverride("timeout", { "src/partial.txt": "partial\n" }, 8_000));
    await vi.waitFor(async () => {
      const execution = kernel.status().executions[0];
      expect(execution?.worktree_path).toBeTruthy();
      await fsp.access(path.join(execution!.worktree_path!, "src/partial.txt"));
    }, { timeout: 4_000 });
    const executionId = kernel.status().executions[0]!.execution_id;
    kernel.cancel(executionId);
    const cancelled = await pending;
    expect(cancelled.state).toBe("cancelled");
    const evidence = kernel.store.db.prepare("SELECT evidence_json FROM evidence WHERE execution_id=?").get(executionId) as { evidence_json: string };
    expect(JSON.parse(evidence.evidence_json).changed_files).toEqual(expect.arrayContaining(["src/partial.txt"]));
    kernel.close();
  });

  it("keeps Hermes disabled in default config and without hermes_enabled", async () => {
    const root = await repository([{ id: "task-a", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer" }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    const config = JSON.parse(await fsp.readFile(path.join(root, ".autoclaw", "orchestrator", "control-plane.config.json"), "utf8")) as { mode: string; hermes_enabled?: boolean };
    expect(config.mode).toBe("mock");
    expect(config.hermes_enabled).toBeUndefined();
    const registration = JSON.parse(String(kernel.store.adapterRegistration("hermes")?.registration_json));
    expect(registration.health).toBe("unavailable");
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker");
    const planned = await kernel.plan("manifest.yaml");
    await expect(kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, { mode: "hermes" })).rejects.toThrow(/disabled/);
    kernel.close();
  });
});

describe("GitHub Issues plan sync and write-back", () => {
  it("creates tasks from open issues, comments on assign, and closes on accept", async () => {
    const comments: Array<{ number: number; body: string }> = [];
    const closed: number[] = [];
    const issues: GitHubIssue[] = [{
      number: 42,
      title: "Add left module",
      body: "---\nwrite_scopes:\n  - src/left/**\nagent_id: worker\nreviewer_agent_id: reviewer\n---\n",
      html_url: "https://github.com/acme/demo/issues/42",
      state: "open",
      labels: [],
    }, {
      number: 7,
      title: "No scope",
      body: "Cannot plan this yet.",
      html_url: "https://github.com/acme/demo/issues/7",
      state: "open",
      labels: ["bug"],
    }];
    const root = await repository([{ id: "seed", write_scopes: ["docs/**"] }]);
    const kernel = new ControlPlaneKernel(root, {
      issuesClient: {
        listOpenIssues: async () => issues,
        comment: async (number, body) => { comments.push({ number, body }); },
        close: async (number) => { closed.push(number); },
      },
    });
    await kernel.init();
    await fsp.writeFile(path.join(root, ".autoclaw", "orchestrator", "github-issues.yaml"), "schema_version: \"1.0\"\nenabled: true\n", "utf8");
    const manifestRel = path.join(".autoclaw", "orchestrator", "manifests", "from-issues.yaml");
    await fsp.writeFile(path.join(root, manifestRel), "tasks: []\n", "utf8");
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" });
    kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker");
    const reviewer = kernel.createSession("reviewer");
    const planned = await kernel.plan(manifestRel);
    const manifest = YAML.parse(await fsp.readFile(path.join(root, manifestRel), "utf8")) as { tasks: Array<{ id: string; write_scopes?: string[] }> };
    expect(manifest.tasks).toHaveLength(1);
    expect(manifest.tasks[0]).toMatchObject({ id: "gh-42", write_scopes: ["src/left/**"] });
    expect(planned.issue_sync).toMatchObject({ status: "ok", added: 1, skipped: 1 });
    expect(planned.assignments[0]).toMatchObject({ task_id: "gh-42", github_issue: 42, assigned_agent_id: "worker" });
    expect(comments[0]?.body).toContain("orchestrate:assign gh-42");
    const skipped = YAML.parse(await fsp.readFile(path.join(root, ".autoclaw", "orchestrator", "issues", "skipped.yaml"), "utf8")) as { skipped: Array<{ github_issue: number; reason: string }> };
    expect(skipped.skipped).toEqual([{ github_issue: 7, title: "No scope", reason: "missing_scope" }]);
    const execution = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, { mode: "mock", mock_changes: { "src/left/result.txt": "ok\n" } });
    const review = kernel.status().reviews[0] as { review_id: string };
    const evidence = kernel.store.db.prepare("SELECT evidence_id FROM evidence WHERE execution_id=?").get(execution.execution_id) as { evidence_id: string };
    const accepted = await kernel.ingestVerdict({
      schema_version: SCHEMA_VERSION, event_id: crypto.randomUUID(), review_id: review.review_id, execution_id: execution.execution_id,
      reviewer_agent_id: "reviewer", reviewer_session_id: reviewer.session_id, verdict: "approve", comments: "verified",
      evidence_refs: [evidence.evidence_id], occurred_at: new Date().toISOString(),
    });
    expect(accepted.state).toBe("accepted");
    expect(comments.some((row) => row.body.includes("orchestrate:done gh-42"))).toBe(true);
    expect(closed).toEqual([42]);
    const replay = await kernel.plan(manifestRel);
    expect(replay.issue_sync).toMatchObject({ added: 0 });
    expect(comments.filter((row) => row.body.includes("orchestrate:assign"))).toHaveLength(1);
    kernel.close();
  });

  it("skips GitHub sync when github-issues.yaml is absent", async () => {
    let listed = 0;
    const root = await repository([{ id: "seed", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer" }]);
    const kernel = new ControlPlaneKernel(root, {
      issuesClient: {
        listOpenIssues: async () => { listed += 1; return []; },
        comment: async () => {},
        close: async () => {},
      },
    });
    await kernel.init();
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" });
    kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    kernel.createSession("worker");
    const planned = await kernel.plan("manifest.yaml");
    expect(listed).toBe(0);
    expect(planned.issue_sync).toMatchObject({ status: "skipped" });
    kernel.close();
  });
});
