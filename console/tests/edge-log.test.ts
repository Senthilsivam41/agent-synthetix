import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { EDGE_LOG_API_VERSION, type EdgeLogError } from "../plugins/control-plane/contracts";
import { WorkspaceLock } from "../plugins/control-plane/store";
import {
  EdgeLog,
  edgeLogCommandForPath,
  edgeLogErrorKeys,
  edgeLogPath,
  executeEdgeLog,
  type EdgeLogCommand,
  type EdgeLogResponse,
} from "../plugins/depgraph/edge-log";

const roots: string[] = [];
const consoleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function workspace() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-edgelog-"));
  roots.push(root);
  return root;
}

function asError(result: EdgeLogResponse): EdgeLogError {
  if (result.ok) throw new Error("expected fail-closed envelope");
  return result;
}

function assertErrorEnvelope(result: EdgeLogError) {
  expect(Object.keys(result).sort()).toEqual([...edgeLogErrorKeys()].sort());
  expect(result).toMatchObject({ api_version: EDGE_LOG_API_VERSION, ok: false, safe_to_proceed: false });
  expect(result.message.length).toBeGreaterThan(0);
}

function claim(actor: string, taskId: string) {
  return { api_version: EDGE_LOG_API_VERSION, actor, task_id: taskId };
}

function write(actor: string, fromTask: string, toTask: string, addedBy = actor) {
  return { api_version: EDGE_LOG_API_VERSION, actor, added_by: addedBy, from_task: fromTask, to_task: toTask };
}

function runProcess(script: string, args: string[], input?: unknown) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...args], { cwd: consoleRoot, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (input === undefined) child.stdin.end();
    else child.stdin.end(JSON.stringify(input));
  });
}

function runWorker(root: string, command: EdgeLogCommand, request: unknown) {
  const worker = path.join(consoleRoot, "plugins/depgraph/edge-log-worker.ts");
  return runProcess(worker, [], { workspace: root, command, request }).then((result) => {
    if (result.code !== 0) throw new Error(`edge worker exited ${result.code}: ${result.stderr || result.stdout}`);
    return JSON.parse(result.stdout) as EdgeLogResponse;
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true });
});

describe("dependency edge log", () => {
  it("returns one fail-closed envelope and does not create a database for a bad request", async () => {
    const root = await workspace();
    const mismatch = asError(executeEdgeLog({
      command: "add",
      workspace: root,
      request: { ...write("worker", "task-a", "task-b"), api_version: "0.9" },
    }));
    const malformed = asError(executeEdgeLog({
      command: "add",
      workspace: root,
      request: { api_version: EDGE_LOG_API_VERSION, actor: "worker" },
    }));
    expect(mismatch.code).toBe("SCHEMA_VERSION_MISMATCH");
    expect(malformed.code).toBe("MALFORMED_REQUEST");
    for (const result of [mismatch, malformed]) assertErrorEnvelope(result);
    expect(fs.existsSync(edgeLogPath(root))).toBe(false);
    const self = asError(executeEdgeLog({ command: "add", workspace: root, request: write("worker", "task-a", "task-a") }));
    expect(self.code).toBe("MALFORMED_REQUEST");
    assertErrorEnvelope(self);
    expect(fs.existsSync(path.join(root, ".autoclaw", "orchestrator", "control-plane.db"))).toBe(false);
  });

  it("enforces from_task ownership and keeps writes out of the kernel lock", async () => {
    const root = await workspace();
    const log = new EdgeLog(root);
    const unowned = asError(log.add(write("worker", "task-a", "task-b")));
    expect(unowned.code).toBe("OWNERSHIP_REJECTED");
    assertErrorEnvelope(unowned);

    const claimed = log.claim(claim("worker", "task-a"));
    if (!claimed.ok) throw new Error(claimed.message);
    expect(claimed.created).toBe(true);
    const repeat = log.claim(claim("worker", "task-a"));
    if (!repeat.ok) throw new Error(repeat.message);
    expect(repeat.created).toBe(false);
    const stolen = asError(log.claim(claim("intruder", "task-a")));
    expect(stolen.code).toBe("OWNERSHIP_REJECTED");
    const mismatched = asError(log.add(write("worker", "task-a", "task-b", "intruder")));
    expect(mismatched.code).toBe("OWNERSHIP_REJECTED");
    const intruder = asError(log.add(write("intruder", "task-a", "task-b")));
    expect(intruder.code).toBe("OWNERSHIP_REJECTED");
    log.close();

    const held = new WorkspaceLock(path.join(root, ".autoclaw", "orchestrator"));
    held.acquire("kernel-holder");
    const duringLock = executeEdgeLog({ command: "add", workspace: root, request: write("worker", "task-a", "task-b") });
    held.release();
    if (!duringLock.ok || !("operation" in duringLock) || duringLock.operation !== "add") throw new Error(!duringLock.ok ? duringLock.message : "expected add");
    expect(duringLock.applied).toBe(true);
    expect(duringLock.edge).toMatchObject({ from_task: "task-a", to_task: "task-b", added_by: "worker", removed_at: null, epoch: 1 });
    expect(fs.existsSync(path.join(root, ".autoclaw", "orchestrator", "control-plane.db"))).toBe(false);
  });

  it("adds idempotently, soft-removes, and answers the reverse index from live edges", async () => {
    const root = await workspace();
    const log = new EdgeLog(root);
    expect(log.claim(claim("alpha", "alpha")).ok).toBe(true);
    expect(log.claim(claim("beta", "beta")).ok).toBe(true);
    const first = log.add(write("alpha", "alpha", "shared"));
    const duplicate = log.add(write("alpha", "alpha", "shared"));
    const other = log.add(write("beta", "beta", "shared"));
    const elsewhere = log.add(write("alpha", "alpha", "elsewhere"));
    if (!first.ok || !duplicate.ok || !other.ok || !elsewhere.ok) throw new Error("expected live edges");
    expect(first.applied).toBe(true);
    expect(duplicate.applied).toBe(false);
    expect(duplicate.edge?.added_at).toBe(first.edge?.added_at);
    expect(log.rows()).toHaveLength(3);

    const removed = log.remove(write("alpha", "alpha", "shared"));
    const removedAgain = log.remove(write("alpha", "alpha", "shared"));
    if (!removed.ok || !removedAgain.ok) throw new Error("expected soft remove");
    expect(removed.applied).toBe(true);
    expect(removed.edge?.removed_at).toEqual(expect.any(String));
    expect(removedAgain.applied).toBe(false);
    expect(removedAgain.edge).toBeNull();

    const hidden = log.dependents({ api_version: EDGE_LOG_API_VERSION, task_id: "shared" });
    if (!hidden.ok) throw new Error(hidden.message);
    expect(hidden.safe_to_proceed).toBe(true);
    expect(hidden.dependents.map((edge) => edge.from_task)).toEqual(["beta"]);

    const restored = log.add(write("alpha", "alpha", "shared"));
    if (!restored.ok) throw new Error(restored.message);
    expect(restored.applied).toBe(true);
    const rows = log.rows().filter((row) => row.from_task === "alpha" && row.to_task === "shared");
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.removed_at)).toHaveLength(1);
    expect(rows.filter((row) => row.removed_at === null)).toHaveLength(1);
    expect(new Set(rows.map((row) => row.add_tag)).size).toBe(2);

    const visible = log.dependents({ api_version: EDGE_LOG_API_VERSION, task_id: "shared" });
    if (!visible.ok) throw new Error(visible.message);
    expect(visible.dependents.map((edge) => edge.from_task).sort()).toEqual(["alpha", "beta"]);
    const unrelated = log.dependents({ api_version: EDGE_LOG_API_VERSION, task_id: "elsewhere" });
    if (!unrelated.ok) throw new Error(unrelated.message);
    expect(unrelated.dependents.map((edge) => edge.from_task)).toEqual(["alpha"]);
    const missing = log.dependents({ api_version: EDGE_LOG_API_VERSION, task_id: "nobody" });
    if (!missing.ok) throw new Error(missing.message);
    expect(missing.dependents).toEqual([]);

    const tombstone = rows.find((row) => row.removed_at);
    expect(() => log.db.prepare("DELETE FROM dependency_edges").run()).toThrow(/physical delete is forbidden/);
    expect(() => log.db.prepare("DELETE FROM task_owners").run()).toThrow(/task ownership cannot be deleted/);
    expect(() => log.db.prepare("UPDATE task_owners SET agent_id='intruder' WHERE task_id='alpha'").run()).toThrow(/cannot be reassigned/);
    expect(() => log.db.prepare("UPDATE dependency_edges SET removed_at=NULL WHERE add_tag=?").run(tombstone!.add_tag)).toThrow(/removed_at can only be set once/);
    expect(() => log.db.prepare("INSERT INTO dependency_edges(from_task,to_task,added_by,added_at,epoch) VALUES('ghost','sink','ghost',?,1)").run(new Date().toISOString())).toThrow(/OWNERSHIP_REJECTED/);
    log.close();

    const reopened = new EdgeLog(root);
    expect(reopened.rows()).toHaveLength(4);
    reopened.close();
  });

  it("keeps one owner and one live edge when several agents write at once", async () => {
    const root = await workspace();
    const ready = new EdgeLog(root);
    ready.close();
    const claims = await Promise.all(["a", "b", "c", "d"].map((actor) => runWorker(root, "claim", claim(actor, "contended"))));
    const winners = claims.filter((result) => result.ok);
    expect(winners).toHaveLength(1);
    expect(claims.filter((result) => !result.ok).map((result) => asError(result).code)).toEqual(["OWNERSHIP_REJECTED", "OWNERSHIP_REJECTED", "OWNERSHIP_REJECTED"]);

    const winner = winners.find((result) => "agent_id" in result);
    const owner = winner && "agent_id" in winner ? winner.agent_id : "";
    const adds = await Promise.all([1, 2, 3, 4].map(() => runWorker(root, "add", write(owner, "contended", "downstream"))));
    expect(adds.every((result) => result.ok && "operation" in result && result.operation === "add")).toBe(true);
    expect(adds.filter((result) => result.ok && "operation" in result && result.operation === "add" && result.applied)).toHaveLength(1);

    await Promise.all(["left", "right", "middle"].map(async (task) => {
      const claimed = await runWorker(root, "claim", claim(task, task));
      if (!claimed.ok) throw new Error(claimed.message);
      const added = await runWorker(root, "add", write(task, task, "hub"));
      if (!added.ok) throw new Error(added.message);
    }));
    const dependents = await runWorker(root, "dependents", { api_version: EDGE_LOG_API_VERSION, task_id: "hub" });
    if (!dependents.ok || !("dependents" in dependents)) throw new Error(!dependents.ok ? dependents.message : "expected dependents");
    expect(dependents.dependents.map((edge) => edge.from_task).sort()).toEqual(["left", "middle", "right"]);

    const inspect = new EdgeLog(root);
    const contended = inspect.rows().filter((row) => row.from_task === "contended" && row.to_task === "downstream");
    expect(contended).toHaveLength(1);
    expect(contended[0]?.removed_at).toBeNull();
    expect(fs.existsSync(path.join(root, ".autoclaw", "orchestrator", "control-plane.db"))).toBe(false);
    inspect.close();
  }, 30_000);

  it("serves the headless commands and the versioned routes", async () => {
    expect(edgeLogCommandForPath("/api/orchestrator/v1/edges/claim")).toBe("claim");
    expect(edgeLogCommandForPath("/api/orchestrator/v1/edges")).toBe("add");
    expect(edgeLogCommandForPath("/api/orchestrator/v1/edges/remove")).toBe("remove");
    expect(edgeLogCommandForPath("/api/orchestrator/v1/edges/dependents")).toBe("dependents");
    expect(edgeLogCommandForPath("/api/orchestrator/v1/status")).toBeNull();

    const root = await workspace();
    const cli = path.join(consoleRoot, "plugins/control-plane/cli.ts");
    const claimed = await runProcess(cli, ["edge-claim", "--workspace", root, "--actor", "worker", "--task", "cli-task"]);
    const added = await runProcess(cli, ["edge-add", "--workspace", root, "--actor", "worker", "--from", "cli-task", "--to", "cli-next"]);
    const listed = await runProcess(cli, ["edge-dependents", "--workspace", root, "--task", "cli-next"]);
    for (const result of [claimed, added, listed]) {
      expect(result.code, result.stderr).toBe(0);
    }
    expect(JSON.parse(claimed.stdout)).toMatchObject({ ok: true, created: true, agent_id: "worker" });
    expect(JSON.parse(added.stdout)).toMatchObject({ ok: true, operation: "add", applied: true });
    expect(JSON.parse(listed.stdout).dependents).toEqual([
      expect.objectContaining({ from_task: "cli-task", to_task: "cli-next", added_by: "worker", epoch: 1, removed_at: null }),
    ]);

    await fsp.writeFile(edgeLogPath(root), "not a sqlite database");
    const unavailable = asError(executeEdgeLog({ command: "dependents", workspace: root, request: { api_version: EDGE_LOG_API_VERSION, task_id: "cli-next" } }));
    expect(unavailable.code).toBe("EDGE_LOG_UNAVAILABLE");
    assertErrorEnvelope(unavailable);
  }, 20_000);
});
