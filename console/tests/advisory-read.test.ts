import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { advisoryErrorKeys, executeAdvisoryRead, queryLeaseStatus, queryTaskState, type AdvisoryReadResponse } from "../plugins/control-plane/advisory-read";
import { ADVISORY_READ_API_VERSION, type AdvisoryReadError } from "../plugins/control-plane/contracts";
import { ControlPlaneKernel } from "../plugins/control-plane/kernel";
import { WorkspaceLock } from "../plugins/control-plane/store";

const roots: string[] = [];
function git(root: string, args: string[]) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }

async function repository() {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-advisory-")); roots.push(base);
  const root = path.join(base, "repo"); await fsp.mkdir(root);
  git(root, ["init", "-b", "main"]); git(root, ["config", "user.name", "Test"]); git(root, ["config", "user.email", "test@example.com"]);
  await fsp.writeFile(path.join(root, ".gitignore"), ".autoclaw/\n", "utf8");
  await fsp.mkdir(path.join(root, "src", "left"), { recursive: true });
  await fsp.writeFile(path.join(root, "src", "left", "base.txt"), "base\n", "utf8");
  await fsp.writeFile(path.join(root, "manifest.yaml"), `tasks:\n  - ${JSON.stringify({ id: "left", write_scopes: ["src/left/**"], agent_id: "worker", reviewer_agent_id: "reviewer" })}\n`, "utf8");
  git(root, ["add", "."]); git(root, ["commit", "-m", "fixture"]);
  return root;
}

function asError(result: AdvisoryReadResponse): AdvisoryReadError {
  if (result.ok) throw new Error("expected fail-closed envelope");
  return result;
}

function assertErrorEnvelope(result: AdvisoryReadError) {
  expect(Object.keys(result).sort()).toEqual([...advisoryErrorKeys()].sort());
  expect(result).toMatchObject({ api_version: ADVISORY_READ_API_VERSION, ok: false, safe_to_proceed: false });
  expect(result.message.length).toBeGreaterThan(0);
}

afterEach(async () => {
  for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true });
});

describe("advisory read API", () => {
  it("returns one fail-closed envelope for every non-success path", async () => {
    const missing = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-advisory-missing-")); roots.push(missing);
    const valid = { api_version: ADVISORY_READ_API_VERSION, query_scopes: ["src/**"] };
    const unreachable = asError(executeAdvisoryRead({ command: "get-lease-status", workspace: missing, request: valid, lockTimeoutMs: 0 }));
    const mismatch = asError(executeAdvisoryRead({ command: "get-lease-status", workspace: missing, request: { ...valid, api_version: "0.9" }, lockTimeoutMs: 0 }));
    const malformed = asError(executeAdvisoryRead({ command: "get-lease-status", workspace: missing, request: { api_version: ADVISORY_READ_API_VERSION, query_scopes: "src/**" }, lockTimeoutMs: 0 }));
    expect(unreachable.code).toBe("KERNEL_UNREACHABLE");
    expect(mismatch.code).toBe("SCHEMA_VERSION_MISMATCH");
    expect(malformed.code).toBe("MALFORMED_REQUEST");
    for (const result of [unreachable, mismatch, malformed]) {
      if (result.ok) throw new Error("expected fail-closed envelope");
      assertErrorEnvelope(result);
    }

    const root = await repository();
    const kernel = new ControlPlaneKernel(root);
    await kernel.init();
    kernel.close();
    const held = new WorkspaceLock(path.join(root, ".autoclaw", "orchestrator"));
    held.acquire("test-holder");
    const locked = asError(executeAdvisoryRead({ command: "get-task-state", workspace: root, request: { api_version: ADVISORY_READ_API_VERSION, task_ids: ["left"] }, lockTimeoutMs: 0 }));
    held.release();
    expect(locked.code).toBe("LOCK_HELD_TIMEOUT");
    assertErrorEnvelope(locked);
  });

  it("reads live lease conflict and task evidence inside the kernel transaction", async () => {
    const root = await repository();
    const kernel = new ControlPlaneKernel(root);
    await kernel.init();
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" });
    kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const session = kernel.createSession("worker");
    const planned = await kernel.plan("manifest.yaml");
    const before = queryTaskState(kernel, { api_version: ADVISORY_READ_API_VERSION, task_ids: ["left", "missing"] });
    if (!before.ok) throw new Error(before.message);
    expect(before.safe_to_proceed).toBe(true);
    expect(before.tasks).toEqual([
      { task_id: "left", found: true, state: "planned", terminal: false, evidence_gated: false },
      { task_id: "missing", found: false, state: null, terminal: false, evidence_gated: false },
    ]);

    await kernel.run(planned.assignments[0]!.assignment_id, session.session_id, { mode: "mock", mock_changes: { "src/left/result.txt": "done\n" } });
    const leases = queryLeaseStatus(kernel, { api_version: ADVISORY_READ_API_VERSION, query_scopes: ["src/**", "docs/**"] });
    if (!leases.ok) throw new Error(leases.message);
    expect(leases.leases).toEqual([
      { scope: "src/**", leased: true, lease_owner: "worker", conflict_risk: "ancestor" },
      { scope: "docs/**", leased: false, lease_owner: null, conflict_risk: "none" },
    ]);
    const after = queryTaskState(kernel, { api_version: ADVISORY_READ_API_VERSION, task_ids: ["left"] });
    if (!after.ok) throw new Error(after.message);
    expect(after.tasks[0]).toMatchObject({ task_id: "left", found: true, state: "awaiting_review", terminal: false, evidence_gated: true });
    kernel.close();

    const reread = executeAdvisoryRead({ command: "get-lease-status", workspace: root, request: { api_version: ADVISORY_READ_API_VERSION, query_scopes: ["src/left/**"] }, lockTimeoutMs: 50 });
    if (!reread.ok || !("leases" in reread)) throw new Error(!reread.ok ? reread.message : "expected lease status");
    expect(reread.leases[0]).toMatchObject({ scope: "src/left/**", leased: true, lease_owner: "worker", conflict_risk: "exact" });
  });
});
