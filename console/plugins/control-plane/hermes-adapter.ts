import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AdapterConfig, HermesCompletionContract } from "./contracts";
import type { AdapterResult, WorkerAdapter, WorkerEvent, WorkerRunHandle, WorkerRunRequest } from "./adapter";
import { contractHonorsAssignment, toHermesCompletionContract } from "./hermes-contract";
import { HermesJsonRpcClient, runHermesJsonRpcSession } from "./hermes-jsonrpc";

export const HERMES_FIXTURE_PATH = fileURLToPath(new URL("./fixtures/hermes-jsonrpc-fixture.mjs", import.meta.url));

type ActiveHermesRun = {
  completion: Promise<AdapterResult>;
  client: HermesJsonRpcClient | null;
  contract: HermesCompletionContract | null;
  approval: { requestId: string; resolve: (decision: "approve" | "deny") => void } | null;
};

export class HermesAgentAdapter implements WorkerAdapter {
  readonly adapterType = "hermes" as const;
  private readonly active = new Map<string, ActiveHermesRun>();

  constructor(_config: AdapterConfig) {}

  capabilities() {
    return ["workspace-write", "json-rpc", "hermes-agent"];
  }

  start(request: WorkerRunRequest): WorkerRunHandle {
    if (request.config.mode !== "hermes" || request.config.hermes_enabled !== true) {
      throw new Error("Hermes Agent adapter is disabled until a pinned 0.20 runtime passes worktree conformance");
    }
    const contract = toHermesCompletionContract(request.assignment, request.worktreePath);
    if (!contractHonorsAssignment(contract, request.assignment)) {
      throw new Error("Hermes completion contract does not honor the kernel assignment");
    }
    const runId = randomUUID();
    const active: ActiveHermesRun = { completion: Promise.resolve({} as AdapterResult), client: null, contract, approval: null };
    const completion = this.execute(runId, request, contract, active);
    active.completion = completion;
    this.active.set(runId, active);
    return { run_id: runId, completion };
  }

  async *events(runId: string): AsyncIterable<WorkerEvent> {
    const active = this.active.get(runId);
    if (!active) throw new Error(`unknown worker run ${runId}`);
    yield { run_id: runId, event_type: "worker_started", occurred_at: new Date().toISOString(), payload: { adapter_type: "hermes", contract_id: active.contract?.contract_id } };
    const result = await active.completion;
    yield {
      run_id: runId,
      event_type: result.status === "completed" ? "worker_completed" : "worker_failed",
      occurred_at: new Date().toISOString(),
      payload: { status: result.status, failure_code: result.failureCode, duration_ms: result.durationMs },
    };
  }

  pendingApproval(runId: string) {
    return this.active.get(runId)?.approval?.requestId ?? null;
  }

  async approve(runId: string, decision: "approve" | "deny") {
    const active = this.active.get(runId);
    if (!active?.approval) throw new Error(`no pending Hermes approval for ${runId}`);
    active.approval.resolve(decision);
    active.approval = null;
  }

  async cancel(runId: string) {
    const active = this.active.get(runId);
    if (!active) throw new Error(`unknown worker run ${runId}`);
    active.client?.cancel("SIGTERM");
  }

  async collect(runId: string) {
    const active = this.active.get(runId);
    if (!active) throw new Error(`unknown worker run ${runId}`);
    return active.completion;
  }

  run(request: WorkerRunRequest) {
    const handle = this.start(request);
    return this.collect(handle.run_id);
  }

  private async execute(runId: string, request: WorkerRunRequest, contract: HermesCompletionContract, active: ActiveHermesRun): Promise<AdapterResult> {
    const session = await runHermesJsonRpcSession({
      config: request.config,
      cwd: path.resolve(request.worktreePath),
      contract,
      timeoutMs: request.config.timeout_ms,
      graceMs: request.config.termination_grace_ms,
      onPid: request.onPid,
      onClient: (client) => { active.client = client; },
      onApproval: (requestId) => new Promise((resolve) => {
        active.approval = { requestId, resolve };
      }),
    });
    return {
      status: session.status === "completed" ? "completed" : "failed",
      stdout: session.stdout,
      stderr: session.stderr,
      exitCode: null,
      pid: session.pid,
      result: {
        ...(session.result ?? {}),
        completion_contract: contract,
        hermes_correlation: {
          external_run_id: String(session.result?.run_id ?? runId),
          external_session_id: session.result?.session_id ?? null,
          version: session.result?.version ?? null,
          worktree_path: path.resolve(request.worktreePath),
          cwd: session.result?.cwd ?? path.resolve(request.worktreePath),
        },
      },
      failureCode: session.failureCode,
      durationMs: session.durationMs,
      terminationReason: session.terminationReason,
    };
  }
}

export function hermesFixtureConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    mode: "hermes",
    python_executable: "unused",
    router_path: ".",
    timeout_ms: 2_000,
    termination_grace_ms: 50,
    env_allowlist: [],
    hermes_enabled: true,
    hermes_executable: process.execPath,
    hermes_args: [HERMES_FIXTURE_PATH],
    ...overrides,
  };
}
