import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, type AdapterConfig, type TaskAssignment } from "../plugins/control-plane/contracts";
import { createWorkerAdapter } from "../plugins/control-plane/adapter";
import { HERMES_FIXTURE_PATH, HermesAgentAdapter, hermesFixtureConfig } from "../plugins/control-plane/hermes-adapter";

const roots: string[] = [];
const assignment: TaskAssignment = {
  schema_version: SCHEMA_VERSION,
  assignment_id: "a",
  task_id: "t",
  sprint_id: null,
  title: "T",
  goal: "G",
  dependencies: [],
  read_scopes: ["src/**"],
  write_scopes: ["src/**"],
  acceptance_criteria: [],
  required_capabilities: [],
  gates: [],
  base_commit: "base",
  assigned_agent_id: "worker",
  reviewer_agent_id: "reviewer",
  created_at: new Date().toISOString(),
};

async function worktree() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-hermes-"));
  roots.push(root);
  await fsp.mkdir(path.join(root, "src"), { recursive: true });
  return root;
}

function config(overrides: Partial<AdapterConfig> = {}) {
  return hermesFixtureConfig({ timeout_ms: 2_000, termination_grace_ms: 50, ...overrides });
}

function setFixture(mode: string, writes: Record<string, string> = {}) {
  process.env.HERMES_FIXTURE_MODE = mode;
  process.env.HERMES_FIXTURE_WRITES = JSON.stringify(writes);
}

afterEach(async () => {
  delete process.env.HERMES_FIXTURE_MODE;
  delete process.env.HERMES_FIXTURE_WRITES;
  delete process.env.SYNTHETIX_TEST_SECRET;
  for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true });
});

describe("Hermes Agent adapter", () => {
  it("runs the JSON-RPC fixture from the assigned worktree", async () => {
    const root = await worktree();
    setFixture("success", { "src/result.txt": "ok\n" });
    const adapter = createWorkerAdapter(config());
    expect(adapter.adapterType).toBe("hermes");
    const result = await adapter.run({ config: config(), assignment, worktreePath: root });
    expect(result.status).toBe("completed");
    expect(result.terminationReason).toBe("completed");
    expect(await fsp.readFile(path.join(root, "src/result.txt"), "utf8")).toBe("ok\n");
    expect(result.result?.hermes_correlation).toMatchObject({
      external_run_id: "ext-run-fixture",
      external_session_id: "ext-session-fixture",
      version: "0.20.0",
    });
    expect(await fsp.realpath(String((result.result?.hermes_correlation as { cwd?: string })?.cwd))).toBe(await fsp.realpath(root));
    expect(result.result?.completion_contract).toMatchObject({ assignment_id: "a", worktree_path: path.resolve(root) });
  });

  it("classifies malformed RPC as invalid_json", async () => {
    const root = await worktree();
    setFixture("malformed");
    const result = await new HermesAgentAdapter(config()).run({ config: config(), assignment, worktreePath: root });
    expect(result.failureCode).toBe("invalid_json");
    expect(result.terminationReason).toBe("invalid_json");
  });

  it("terminates and classifies a timeout", async () => {
    const root = await worktree();
    setFixture("timeout");
    const timed = config({ timeout_ms: 300 });
    const result = await new HermesAgentAdapter(timed).run({ config: timed, assignment, worktreePath: root });
    expect(result.failureCode).toBe("timeout");
    expect(result.terminationReason).toBe("timeout");
    expect(result.durationMs).toBeLessThan(2_000);
  });

  it("classifies a process crash", async () => {
    const root = await worktree();
    setFixture("crash");
    const result = await new HermesAgentAdapter(config()).run({ config: config(), assignment, worktreePath: root });
    expect(result.failureCode).toBe("process_failure");
    expect(result.terminationReason).toBe("process_failure");
  });

  it("cancels an in-flight fixture process", async () => {
    const root = await worktree();
    setFixture("timeout");
    const long = config({ timeout_ms: 5_000 });
    const adapter = new HermesAgentAdapter(long);
    const handle = adapter.start({ config: long, assignment, worktreePath: root });
    await new Promise((resolve) => setTimeout(resolve, 40));
    await adapter.cancel(handle.run_id);
    const result = await adapter.collect(handle.run_id);
    expect(result.status).toBe("failed");
    expect(["process_failure", "timeout"]).toContain(result.failureCode);
  });

  it("approves a blocked fixture run", async () => {
    const root = await worktree();
    setFixture("approval", { "src/approved.txt": "yes\n" });
    const adapter = new HermesAgentAdapter(config());
    const handle = adapter.start({ config: config(), assignment, worktreePath: root });
    await vi.waitFor(() => {
      expect(adapter.pendingApproval(handle.run_id)).toBe("appr-1");
    });
    await adapter.approve(handle.run_id, "approve");
    const result = await adapter.collect(handle.run_id);
    expect(result.status).toBe("completed");
    expect(await fsp.readFile(path.join(root, "src/approved.txt"), "utf8")).toBe("yes\n");
  });

  it("denies a blocked fixture run", async () => {
    const root = await worktree();
    setFixture("approval");
    const adapter = new HermesAgentAdapter(config());
    const handle = adapter.start({ config: config(), assignment, worktreePath: root });
    await vi.waitFor(() => {
      expect(adapter.pendingApproval(handle.run_id)).toBe("appr-1");
    });
    await adapter.approve(handle.run_id, "deny");
    const result = await adapter.collect(handle.run_id);
    expect(result.status).toBe("failed");
  });

  it("redacts allowlisted secrets from diagnostics and does not put them in argv", async () => {
    const secret = "do-not-persist-this-hermes-secret";
    process.env.SYNTHETIX_TEST_SECRET = secret;
    const root = await worktree();
    setFixture("secret");
    const secretConfig = config({ env_allowlist: ["SYNTHETIX_TEST_SECRET"] });
    expect(JSON.stringify([secretConfig.hermes_executable, secretConfig.hermes_args])).not.toContain(secret);
    expect(HERMES_FIXTURE_PATH).not.toContain(secret);
    const result = await new HermesAgentAdapter(secretConfig).run({ config: secretConfig, assignment, worktreePath: root });
    expect(result.status).toBe("completed");
    const blob = `${result.stdout}${result.stderr}${JSON.stringify(result.result)}`;
    expect(blob).not.toContain(secret);
    expect(blob).toContain("[REDACTED:SYNTHETIX_TEST_SECRET]");
  });

  it("stays disabled unless hermes_enabled is true", async () => {
    const root = await worktree();
    const disabled = config({ hermes_enabled: false });
    const adapter = new HermesAgentAdapter(disabled);
    expect(() => adapter.start({ config: disabled, assignment, worktreePath: root })).toThrow(/disabled/);
    const unset = { ...config(), hermes_enabled: undefined };
    expect(() => new HermesAgentAdapter(unset).start({ config: unset, assignment, worktreePath: root })).toThrow(/disabled/);
  });
});
