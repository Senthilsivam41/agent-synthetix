import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { EDGE_LOG_API_VERSION, type EdgeLogError } from "../plugins/control-plane/contracts";
import { WorkspaceLock } from "../plugins/control-plane/store";
import { EdgeLog, edgeLogErrorKeys, edgeLogHttpStatus, edgeLogPath, type EdgeLogResponse } from "../plugins/depgraph/edge-log";
import { DependencyIndex, admitDependencyEdge, holdValidatorRebuild, validatorLockPath } from "../plugins/depgraph/validator";

const roots: string[] = [];
const children: ChildProcess[] = [];
const consoleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = path.join(consoleRoot, "plugins/depgraph/validator-worker.ts");
const cliPath = path.join(consoleRoot, "plugins/control-plane/cli.ts");

async function workspace() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-validator-"));
  roots.push(root);
  return root;
}

function asError(result: EdgeLogResponse | { ok: true; safe_to_proceed: true; rebuilt_edges: number }): EdgeLogError {
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

function own(root: string, tasks: string[]) {
  const log = new EdgeLog(root);
  for (const task of tasks) {
    const result = log.claim(claim(task, task));
    if (!result.ok) throw new Error(result.message);
  }
  log.close();
}

function livePairs(root: string) {
  const log = new EdgeLog(root);
  try {
    return log.liveEdgePairs();
  } finally {
    log.close();
  }
}

function isDag(pairs: Array<{ from_task: string; to_task: string }>) {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const pair of pairs) {
    incoming.set(pair.from_task, incoming.get(pair.from_task) ?? 0);
    incoming.set(pair.to_task, incoming.get(pair.to_task) ?? 0);
    outgoing.set(pair.from_task, [...(outgoing.get(pair.from_task) ?? []), pair.to_task]);
  }
  for (const pair of pairs) incoming.set(pair.to_task, (incoming.get(pair.to_task) ?? 0) + 1);
  const queue = [...incoming.keys()].filter((node) => incoming.get(node) === 0);
  let seen = 0;
  while (queue.length) {
    const node = queue.shift();
    if (!node) break;
    seen += 1;
    for (const next of outgoing.get(node) ?? []) {
      const count = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, count);
      if (count === 0) queue.push(next);
    }
  }
  return seen === incoming.size;
}

function runProcess(script: string, args: string[], input?: unknown) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...args], { cwd: consoleRoot, stdio: ["pipe", "pipe", "pipe"] });
    children.push(child);
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

function startWorker(root: string, payload: Record<string, unknown>) {
  const child = spawn(process.execPath, ["--import", "tsx", workerPath], { cwd: consoleRoot, stdio: ["pipe", "pipe", "pipe"] });
  children.push(child);
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  child.stdin.end(JSON.stringify({ workspace: root, ...payload }));
  return { child, closed };
}

async function waitForFile(file: string) {
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
  }
  for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true });
});

describe("dependency edge validator", () => {
  it("bounds the cycle walk to the component that already contains the target", () => {
    const cluster = 400;
    const pairs: Array<{ from_task: string; to_task: string }> = [];
    for (let index = 0; index < cluster - 1; index += 1) pairs.push({ from_task: `c${index}`, to_task: `c${index + 1}` });
    for (let index = 0; index < cluster; index += 2) pairs.push({ from_task: `s${index}`, to_task: `s${index + 1}` });
    const index = DependencyIndex.fromPairs(pairs);

    const outside = index.wouldCreateCycle("outside", "c0");
    expect(outside).toEqual({ cycle: false, nodesVisited: 0 });

    const closing = index.wouldCreateCycle(`c${cluster - 1}`, "c0");
    expect(closing.cycle).toBe(true);
    expect(closing.nodesVisited).toBe(cluster);

    const pair = index.wouldCreateCycle("s1", "s0");
    expect(pair).toEqual({ cycle: true, nodesVisited: 2 });
    expect(closing.nodesVisited).toBeGreaterThan(pair.nodesVisited);

    const diamond = DependencyIndex.fromPairs([
      { from_task: "a", to_task: "b" },
      { from_task: "a", to_task: "c" },
    ]);
    expect(diamond.wouldCreateCycle("b", "c")).toEqual({ cycle: false, nodesVisited: 1 });
  });

  it("admits a dag edge, rejects the edge that would close it, and reloads after a remove", async () => {
    const root = await workspace();
    own(root, ["a", "b", "c"]);
    const forward = admitDependencyEdge({ workspace: root, request: write("a", "a", "b") });
    const again = admitDependencyEdge({ workspace: root, request: write("a", "a", "b") });
    const diamond = admitDependencyEdge({ workspace: root, request: write("a", "a", "c") });
    const join = admitDependencyEdge({ workspace: root, request: write("b", "b", "c") });
    const back = asError(admitDependencyEdge({ workspace: root, request: write("b", "b", "a") }));
    expect(forward).toMatchObject({ ok: true, operation: "add", applied: true, safe_to_proceed: true });
    expect(again).toMatchObject({ ok: true, operation: "add", applied: false });
    expect(diamond).toMatchObject({ ok: true, applied: true });
    expect(join).toMatchObject({ ok: true, applied: true });
    expect(back.code).toBe("CYCLE_DETECTED");
    assertErrorEnvelope(back);
    expect(edgeLogHttpStatus(back.code)).toBe(409);
    expect(livePairs(root).map((pair) => `${pair.from_task}->${pair.to_task}`).sort()).toEqual(["a->b", "a->c", "b->c"]);

    const log = new EdgeLog(root);
    const removed = log.remove(write("a", "a", "b"));
    log.close();
    if (!removed.ok) throw new Error(removed.message);
    const reversed = admitDependencyEdge({ workspace: root, request: write("b", "b", "a") });
    expect(reversed).toMatchObject({ ok: true, operation: "add", applied: true });
    expect(isDag(livePairs(root))).toBe(true);

    const self = asError(admitDependencyEdge({ workspace: root, request: write("a", "a", "a") }));
    expect(self.code).toBe("MALFORMED_REQUEST");
    const unowned = asError(admitDependencyEdge({ workspace: root, request: write("c", "a", "b", "c") }));
    expect(unowned.code).toBe("OWNERSHIP_REJECTED");
    const stored = new EdgeLog(root);
    expect(stored.rows().every((row) => row.epoch === 1)).toBe(true);
    stored.close();
  });

  it("rejects a bad request before creating the edge log", async () => {
    const root = await workspace();
    const mismatch = asError(admitDependencyEdge({ workspace: root, request: { api_version: "9.9", actor: "a", added_by: "a", from_task: "a", to_task: "b" } }));
    expect(mismatch.code).toBe("SCHEMA_VERSION_MISMATCH");
    assertErrorEnvelope(mismatch);
    expect(fs.existsSync(edgeLogPath(root))).toBe(false);
    expect(fs.existsSync(validatorLockPath(root))).toBe(false);
  });

  it("admits an edge while the kernel workspace lock is held", async () => {
    const root = await workspace();
    own(root, ["a"]);
    const lock = new WorkspaceLock(path.join(root, ".autoclaw", "orchestrator"));
    lock.acquire("kernel");
    try {
      const admitted = admitDependencyEdge({ workspace: root, request: write("a", "a", "b") });
      expect(admitted).toMatchObject({ ok: true, applied: true });
      expect(fs.existsSync(path.join(root, ".autoclaw", "orchestrator", "control-plane.db"))).toBe(false);
      expect(fs.existsSync(validatorLockPath(root))).toBe(false);
    } finally {
      lock.release();
    }
  });

  it("lets concurrent acyclic admits wait, and keeps a triangle a dag", async () => {
    const root = await workspace();
    own(root, ["p0", "p1", "p2", "p3", "a", "b", "c"]);
    const acyclic = await Promise.all([0, 1, 2, 3].map((index) => runProcess(workerPath, [], {
      workspace: root,
      mode: "admit",
      request: write(`p${index}`, `p${index}`, "hub"),
    })));
    expect(acyclic.every((result) => result.code === 0)).toBe(true);
    const admitted = acyclic.map((result) => JSON.parse(result.stdout) as EdgeLogResponse);
    expect(admitted.every((result) => result.ok && "applied" in result && result.applied)).toBe(true);

    const triangle = await Promise.all(["a", "b", "c"].map((from, index, tasks) => runProcess(workerPath, [], {
      workspace: root,
      mode: "admit",
      request: write(from, from, tasks[(index + 1) % tasks.length] ?? from),
    })));
    const bodies = triangle.map((result) => JSON.parse(result.stdout) as EdgeLogResponse);
    expect(bodies.filter((result) => result.ok && "applied" in result && result.applied)).toHaveLength(2);
    expect(bodies.filter((result) => !result.ok && result.code === "CYCLE_DETECTED")).toHaveLength(1);
    const trianglePairs = livePairs(root).filter((pair) => ["a", "b", "c"].includes(pair.from_task));
    expect(trianglePairs).toHaveLength(2);
    expect(isDag(livePairs(root))).toBe(true);
  }, 30_000);

  it("refuses checks while a restart rebuilds the index", async () => {
    const root = await workspace();
    own(root, ["a"]);
    const entered = path.join(root, "rebuild-entered");
    const release = path.join(root, "rebuild-release");
    const held = startWorker(root, { mode: "rebuild-hold", entered, release });
    await waitForFile(entered);
    const blocked = asError(admitDependencyEdge({ workspace: root, request: write("a", "a", "b") }));
    expect(blocked.code).toBe("INDEX_REBUILDING");
    expect(edgeLogHttpStatus(blocked.code)).toBe(503);
    assertErrorEnvelope(blocked);
    await fsp.writeFile(release, "go");
    const finished = await held.closed;
    expect(finished.code, finished.stderr).toBe(0);
    const admitted = admitDependencyEdge({ workspace: root, request: write("a", "a", "b") });
    expect(admitted).toMatchObject({ ok: true, applied: true });
    expect(holdValidatorRebuild(root)).toMatchObject({ ok: true, rebuilt_edges: 1 });
  }, 30_000);

  it("drops an uncommitted edge after a crash and rebuilds before serving again", async () => {
    const root = await workspace();
    own(root, ["a", "b"]);
    const entered = path.join(root, "commit-entered");
    const release = path.join(root, "commit-release");
    const crashed = startWorker(root, {
      mode: "admit-hold-commit",
      entered,
      release,
      request: write("a", "a", "lost"),
    });
    await waitForFile(entered);
    crashed.child.kill("SIGKILL");
    const killed = await crashed.closed;
    expect(killed.code).not.toBe(0);
    expect(livePairs(root).some((pair) => pair.to_task === "lost")).toBe(false);

    const rebuildEntered = path.join(root, "recover-entered");
    const rebuildRelease = path.join(root, "recover-release");
    const recovery = startWorker(root, {
      mode: "admit-recover",
      entered: rebuildEntered,
      release: rebuildRelease,
      request: write("b", "b", "kept"),
    });
    await waitForFile(rebuildEntered);
    const blocked = asError(admitDependencyEdge({ workspace: root, request: write("a", "a", "during") }));
    expect(blocked.code).toBe("INDEX_REBUILDING");
    assertErrorEnvelope(blocked);
    await fsp.writeFile(rebuildRelease, "go");
    const finished = await recovery.closed;
    expect(finished.code, finished.stderr).toBe(0);
    expect(JSON.parse(finished.stdout)).toMatchObject({ ok: true, applied: true });
    const pairs = livePairs(root);
    expect(pairs.some((pair) => pair.to_task === "lost")).toBe(false);
    expect(pairs.some((pair) => pair.from_task === "b" && pair.to_task === "kept")).toBe(true);
    const keeper = new EdgeLog(root);
    const claimed = keeper.claim(claim("kept", "kept"));
    keeper.close();
    if (!claimed.ok) throw new Error(claimed.message);
    const closing = asError(admitDependencyEdge({ workspace: root, request: write("kept", "kept", "b") }));
    expect(closing.code).toBe("CYCLE_DETECTED");
  }, 30_000);

  it("rejects a back edge from the headless add command", async () => {
    const root = await workspace();
    const claimedA = await runProcess(cliPath, ["edge-claim", "--workspace", root, "--actor", "a", "--task", "a"]);
    const claimedB = await runProcess(cliPath, ["edge-claim", "--workspace", root, "--actor", "b", "--task", "b"]);
    const forward = await runProcess(cliPath, ["edge-add", "--workspace", root, "--actor", "a", "--from", "a", "--to", "b"]);
    const back = await runProcess(cliPath, ["edge-add", "--workspace", root, "--actor", "b", "--from", "b", "--to", "a"]);
    expect(claimedA.code, claimedA.stderr).toBe(0);
    expect(claimedB.code, claimedB.stderr).toBe(0);
    expect(forward.code, forward.stderr).toBe(0);
    expect(back.code).not.toBe(0);
    expect(JSON.parse(back.stdout).code).toBe("CYCLE_DETECTED");
    expect(livePairs(root)).toEqual([{ from_task: "a", to_task: "b" }]);
  }, 20_000);
});
