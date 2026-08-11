import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type AdapterConfig, type TaskAssignment } from "../plugins/control-plane/contracts";
import { runAdapter } from "../plugins/control-plane/adapter";

const roots: string[] = [];
const assignment: TaskAssignment = { schema_version: SCHEMA_VERSION, assignment_id: "a", task_id: "t", sprint_id: null, title: "T", goal: "G", dependencies: [], read_scopes: ["src/**"], write_scopes: ["src/**"], acceptance_criteria: [], required_capabilities: [], gates: [], base_commit: "base", assigned_agent_id: "worker", reviewer_agent_id: "reviewer", created_at: new Date().toISOString() };

async function fixture(script: string) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-adapter-")); roots.push(root);
  const executable = path.join(root, "adapter-fixture.sh"); await fsp.writeFile(executable, script, { mode: 0o700 });
  return { root, executable };
}

function config(executable: string, overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return { mode: "dual-router", python_executable: executable, router_path: ".", timeout_ms: 500, termination_grace_ms: 20, env_allowlist: [], ...overrides };
}

afterEach(async () => { delete process.env.SYNTHETIX_TEST_SECRET; for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true }); });

describe("subprocess adapter", () => {
  it("classifies spawn failure separately", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-adapter-")); roots.push(root);
    const result = await runAdapter(config(path.join(root, "missing-python")), assignment, root);
    expect(result.failureCode).toBe("process_failure");
    expect(result.terminationReason).toBe("process_failure");
  });

  it("redacts allowlisted secret values from persisted output", async () => {
    const secret = "do-not-persist-this-value"; process.env.SYNTHETIX_TEST_SECRET = secret;
    const { root, executable } = await fixture(`#!/bin/sh\nprintf '{"status":"completed","value":"%s"}\\n' "$SYNTHETIX_TEST_SECRET"\nprintf '%s\\n' "$SYNTHETIX_TEST_SECRET" >&2\n`);
    const result = await runAdapter(config(executable, { env_allowlist: ["SYNTHETIX_TEST_SECRET"], timeout_ms: 2_000 }), assignment, root);
    expect(result.status).toBe("completed");
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
  });

  it("terminates and classifies a timeout", async () => {
    const { root, executable } = await fixture("#!/bin/sh\nsleep 2\n");
    const result = await runAdapter(config(executable, { timeout_ms: 20 }), assignment, root);
    expect(result.failureCode).toBe("timeout");
    expect(result.durationMs).toBeLessThan(1000);
  });
});
