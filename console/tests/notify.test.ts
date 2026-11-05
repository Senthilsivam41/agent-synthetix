import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { EDGE_LOG_API_VERSION, type DependencySignal, type EdgeLogError } from "../plugins/control-plane/contracts";
import { WorkspaceLock } from "../plugins/control-plane/store";
import { EdgeLog, edgeLogCommandForPath, edgeLogErrorKeys, edgeLogPath, type EdgeLogResponse } from "../plugins/depgraph/edge-log";
import { executeEdgeRoute } from "../plugins/depgraph/edge-route";
import { dependencyNotificationLogPath, notifyDependents } from "../plugins/depgraph/notify";
import { admitDependencyEdge } from "../plugins/depgraph/validator";

const roots: string[] = [];
const consoleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(consoleRoot, "plugins/control-plane/cli.ts");
const signalKeys = ["edge_epoch", "from", "id", "notified_task", "originating_task", "session_id", "timestamp", "to", "type"];

async function workspace() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-notify-"));
  roots.push(root);
  return root;
}

function asError(result: EdgeLogResponse | { ok: true }): EdgeLogError {
  if (result.ok) throw new Error("expected fail-closed envelope");
  return result;
}

function assertErrorEnvelope(result: EdgeLogError) {
  expect(Object.keys(result).sort()).toEqual([...edgeLogErrorKeys()].sort());
  expect(result).toMatchObject({ api_version: EDGE_LOG_API_VERSION, ok: false, safe_to_proceed: false });
}

function claim(actor: string, taskId: string) {
  return { api_version: EDGE_LOG_API_VERSION, actor, task_id: taskId };
}

function write(actor: string, fromTask: string, toTask: string) {
  return { api_version: EDGE_LOG_API_VERSION, actor, added_by: actor, from_task: fromTask, to_task: toTask };
}

function notifyRequest(actor: string, taskId: string, writebackId: string) {
  return { api_version: EDGE_LOG_API_VERSION, actor, session_id: `session-${actor}`, task_id: taskId, writeback_id: writebackId };
}

function own(root: string, owners: Array<[string, string]>) {
  const log = new EdgeLog(root);
  for (const [actor, task] of owners) {
    const result = log.claim(claim(actor, task));
    if (!result.ok) throw new Error(result.message);
  }
  log.close();
}

function inboxDir(root: string, agentId: string) {
  return path.join(root, ".autoclaw", "orchestrator", "comms", "inboxes", agentId);
}

function signals(root: string, agentId: string) {
  const dir = inboxDir(root, agentId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.startsWith("dependency_invalidated-")).sort();
}

function readSignal(root: string, agentId: string, fileName: string) {
  return JSON.parse(fs.readFileSync(path.join(inboxDir(root, agentId), fileName), "utf8")) as DependencySignal;
}

function runProcess(args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", cliPath, ...args], { cwd: consoleRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true });
});

describe("targeted dependency notification", () => {
  it("signals only the agents that declared a live dependency", async () => {
    const root = await workspace();
    own(root, [["alpha", "task-a"], ["epsilon", "task-e"], ["beta", "task-b"], ["gamma", "task-c"], ["delta", "task-d"]]);
    expect(admitDependencyEdge({ workspace: root, request: write("alpha", "task-a", "task-b") })).toMatchObject({ ok: true, applied: true });
    expect(admitDependencyEdge({ workspace: root, request: write("epsilon", "task-e", "task-b") })).toMatchObject({ ok: true, applied: true });
    expect(admitDependencyEdge({ workspace: root, request: write("delta", "task-d", "task-c") })).toMatchObject({ ok: true, applied: true });
    await fsp.mkdir(inboxDir(root, "gamma"), { recursive: true });
    await fsp.writeFile(path.join(inboxDir(root, "gamma"), "note.json"), "{}\n");

    const first = notifyDependents({ workspace: root, request: notifyRequest("beta", "task-b", "wb-1") });
    if (!first.ok || !("notified" in first)) throw new Error(!first.ok ? first.message : "expected notifications");
    expect(first.replayed).toBe(false);
    expect(first.safe_to_proceed).toBe(true);
    expect(first.notified.map((notice) => [notice.notified_task, notice.agent_id, notice.edge_epoch])).toEqual([
      ["task-a", "alpha", 1],
      ["task-e", "epsilon", 1],
    ]);
    expect(signals(root, "alpha")).toHaveLength(1);
    expect(signals(root, "epsilon")).toHaveLength(1);
    expect(signals(root, "gamma")).toEqual([]);
    expect(fs.readdirSync(inboxDir(root, "gamma"))).toEqual(["note.json"]);
    expect(fs.existsSync(inboxDir(root, "delta"))).toBe(false);
    expect(fs.existsSync(inboxDir(root, "shared"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".autoclaw", "orchestrator", "control-plane.db"))).toBe(false);

    const signal = readSignal(root, "alpha", signals(root, "alpha")[0] ?? "");
    expect(Object.keys(signal).sort()).toEqual(signalKeys);
    expect(signal).toMatchObject({
      from: "beta",
      to: "alpha",
      type: "dependency_invalidated",
      session_id: "session-beta",
      originating_task: "task-b",
      notified_task: "task-a",
      edge_epoch: 1,
    });
    expect(JSON.stringify(signal)).not.toMatch(/plan|payload|goal|scope/i);

    const projection = fs.readFileSync(dependencyNotificationLogPath(root), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { notified_task: string; originating_task: string; edge_epoch: number });
    expect(projection.map((row) => [row.originating_task, row.notified_task, row.edge_epoch])).toEqual([
      ["task-b", "task-a", 1],
      ["task-b", "task-e", 1],
    ]);

    const replay = notifyDependents({ workspace: root, request: notifyRequest("beta", "task-b", "wb-1") });
    expect(replay).toMatchObject({ ok: true, replayed: true, notified: first.notified });
    expect(signals(root, "alpha")).toHaveLength(1);
    expect(fs.readFileSync(dependencyNotificationLogPath(root), "utf8").trim().split("\n")).toHaveLength(2);

    const removed = new EdgeLog(root);
    const removal = removed.remove(write("alpha", "task-a", "task-b"));
    removed.close();
    if (!removal.ok) throw new Error(removal.message);
    const second = notifyDependents({ workspace: root, request: notifyRequest("beta", "task-b", "wb-2") });
    expect(second).toMatchObject({ ok: true, replayed: false, notified: [expect.objectContaining({ notified_task: "task-e", agent_id: "epsilon" })] });
    expect(signals(root, "alpha")).toHaveLength(1);
    expect(signals(root, "epsilon")).toHaveLength(2);

    const intruder = asError(notifyDependents({ workspace: root, request: notifyRequest("gamma", "task-b", "wb-3") }));
    expect(intruder.code).toBe("OWNERSHIP_REJECTED");
    assertErrorEnvelope(intruder);
    expect(signals(root, "alpha")).toHaveLength(1);

    const extra = new EdgeLog(root);
    const claimed = extra.claim(claim("beta", "task-b2"));
    extra.close();
    if (!claimed.ok) throw new Error(claimed.message);
    const reused = asError(notifyDependents({ workspace: root, request: notifyRequest("beta", "task-b2", "wb-1") }));
    expect(reused.code).toBe("MALFORMED_REQUEST");
    expect(signals(root, "delta")).toEqual([]);

    const inspect = new EdgeLog(root);
    expect(() => inspect.db.prepare("DELETE FROM dependency_notifications").run()).toThrow(/cannot be deleted/);
    expect(() => inspect.db.prepare("DELETE FROM dependency_writebacks").run()).toThrow(/cannot be deleted/);
    inspect.close();
  });

  it("rejects a bad notify request before creating the edge log", async () => {
    const root = await workspace();
    const mismatch = asError(notifyDependents({ workspace: root, request: { api_version: "9.9", actor: "beta", session_id: "s", task_id: "task-b", writeback_id: "wb" } }));
    expect(mismatch.code).toBe("SCHEMA_VERSION_MISMATCH");
    assertErrorEnvelope(mismatch);
    expect(fs.existsSync(edgeLogPath(root))).toBe(false);
    expect(edgeLogCommandForPath("/api/orchestrator/v1/edges/notify")).toBe("notify");
    const routed = asError(executeEdgeRoute({ command: "notify", workspace: root, request: { api_version: EDGE_LOG_API_VERSION } }));
    expect(routed.code).toBe("MALFORMED_REQUEST");
    expect(fs.existsSync(edgeLogPath(root))).toBe(false);
  });

  it("notifies while the kernel workspace lock is held", async () => {
    const root = await workspace();
    own(root, [["alpha", "task-a"], ["beta", "task-b"]]);
    expect(admitDependencyEdge({ workspace: root, request: write("alpha", "task-a", "task-b") })).toMatchObject({ ok: true });
    const lock = new WorkspaceLock(path.join(root, ".autoclaw", "orchestrator"));
    lock.acquire("kernel");
    try {
      const notified = notifyDependents({ workspace: root, request: notifyRequest("beta", "task-b", "wb-lock") });
      expect(notified).toMatchObject({ ok: true, notified: [expect.objectContaining({ agent_id: "alpha" })] });
      expect(fs.existsSync(path.join(root, ".autoclaw", "orchestrator", "control-plane.db"))).toBe(false);
    } finally {
      lock.release();
    }
  });

  it("delivers the headless notify command once when two callers race", async () => {
    const root = await workspace();
    const claimedA = await runProcess(["edge-claim", "--workspace", root, "--actor", "alpha", "--task", "task-a"]);
    const claimedB = await runProcess(["edge-claim", "--workspace", root, "--actor", "beta", "--task", "task-b"]);
    const added = await runProcess(["edge-add", "--workspace", root, "--actor", "alpha", "--from", "task-a", "--to", "task-b"]);
    expect(claimedA.code, claimedA.stderr).toBe(0);
    expect(claimedB.code, claimedB.stderr).toBe(0);
    expect(added.code, added.stderr).toBe(0);
    const args = ["edge-notify", "--workspace", root, "--actor", "beta", "--task", "task-b", "--session", "session-beta", "--writeback", "wb-race"];
    const raced = await Promise.all([runProcess(args), runProcess(args)]);
    expect(raced.every((result) => result.code === 0)).toBe(true);
    const bodies = raced.map((result) => JSON.parse(result.stdout) as { replayed: boolean; notified: Array<{ notified_task: string }> });
    expect(bodies.filter((body) => body.replayed)).toHaveLength(1);
    expect(bodies.map((body) => body.notified.map((notice) => notice.notified_task))).toEqual([["task-a"], ["task-a"]]);
    expect(signals(root, "alpha")).toHaveLength(1);
    expect(signals(root, "beta")).toEqual([]);
  }, 20_000);
});
