import fs from "node:fs";
import path from "node:path";
import { EDGE_LOG_API_VERSION, type EdgeLogError, type EdgeWriteRequest } from "../control-plane/contracts";
import { validateContract } from "../control-plane/schemas";
import { EdgeLog, edgeLogError, type EdgeLogResponse } from "./edge-log";

export type CycleCheck = { cycle: boolean; nodesVisited: number };

type LockState = "rebuilding" | "serving";
type LockRecord = { pid: number; state: LockState; acquired_at: string };

export type ValidatorHooks = {
  duringRebuild?: () => void;
  beforeCommit?: () => void;
};

const LOCK_WAIT_MS = 10_000;

function waitMs(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function validatorLockPath(workspace: string) {
  return path.join(path.resolve(workspace), ".autoclaw", "orchestrator", "depgraph-validator.lock");
}

function pidAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLock(file: string): LockRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<LockRecord>;
    const pid = parsed.pid;
    if ((parsed.state !== "rebuilding" && parsed.state !== "serving") || typeof pid !== "number" || !Number.isInteger(pid)) return null;
    return { pid, state: parsed.state, acquired_at: String(parsed.acquired_at ?? "") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

function tryCreate(file: string, state: LockState) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    const fd = fs.openSync(file, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, state, acquired_at: new Date().toISOString() }));
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

function updateState(file: string, state: LockState) {
  const current = readLock(file);
  if (current?.pid !== process.pid) throw new Error("lost dependency validator lock before the index was ready");
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, state, acquired_at: new Date().toISOString() }));
}

function releaseLock(file: string) {
  const current = readLock(file);
  if (current?.pid === process.pid) {
    try { fs.unlinkSync(file); } catch { /* already removed */ }
  }
}

function discardDeadLock(file: string) {
  const current = readLock(file);
  if (current && pidAlive(current.pid)) return false;
  try { fs.unlinkSync(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return true;
}

export class DependencyIndex {
  private readonly parent = new Map<string, string>();
  private readonly rank = new Map<string, number>();
  private readonly outgoing = new Map<string, string[]>();

  static fromPairs(pairs: Array<{ from_task: string; to_task: string }>) {
    const index = new DependencyIndex();
    for (const pair of pairs) index.link(pair.from_task, pair.to_task);
    return index;
  }

  wouldCreateCycle(fromTask: string, toTask: string): CycleCheck {
    this.ensure(fromTask);
    this.ensure(toTask);
    if (this.find(fromTask) !== this.find(toTask)) return { cycle: false, nodesVisited: 0 };
    const component = this.find(toTask);
    const seen = new Set<string>();
    const queue = [toTask];
    let nodesVisited = 0;
    while (queue.length) {
      const node = queue.shift();
      if (!node || seen.has(node) || this.find(node) !== component) continue;
      seen.add(node);
      nodesVisited += 1;
      if (node === fromTask) return { cycle: true, nodesVisited };
      for (const next of this.outgoing.get(node) ?? []) queue.push(next);
    }
    return { cycle: false, nodesVisited };
  }

  link(fromTask: string, toTask: string) {
    this.ensure(fromTask);
    this.ensure(toTask);
    this.union(fromTask, toTask);
    const next = this.outgoing.get(fromTask) ?? [];
    if (!next.includes(toTask)) next.push(toTask);
    this.outgoing.set(fromTask, next);
  }

  private ensure(node: string) {
    if (!this.parent.has(node)) {
      this.parent.set(node, node);
      this.rank.set(node, 0);
    }
  }

  private find(node: string): string {
    this.ensure(node);
    const parent = this.parent.get(node);
    if (!parent) return node;
    if (parent === node) return node;
    const root = this.find(parent);
    this.parent.set(node, root);
    return root;
  }

  private union(left: string, right: string) {
    let rootLeft = this.find(left);
    let rootRight = this.find(right);
    if (rootLeft === rootRight) return;
    const rankLeft = this.rank.get(rootLeft) ?? 0;
    const rankRight = this.rank.get(rootRight) ?? 0;
    if (rankLeft < rankRight) [rootLeft, rootRight] = [rootRight, rootLeft];
    this.parent.set(rootRight, rootLeft);
    if (rankLeft === rankRight) this.rank.set(rootLeft, rankLeft + 1);
  }
}

function prepareWrite(request: unknown): { ok: true; write: EdgeWriteRequest } | { ok: false; error: EdgeLogError } {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { ok: false, error: edgeLogError("MALFORMED_REQUEST", "request must be an object") };
  }
  if (!("api_version" in request)) return { ok: false, error: edgeLogError("MALFORMED_REQUEST", "request is missing api_version") };
  if ((request as { api_version?: unknown }).api_version !== EDGE_LOG_API_VERSION) {
    return { ok: false, error: edgeLogError("SCHEMA_VERSION_MISMATCH", `api_version must be ${EDGE_LOG_API_VERSION}`) };
  }
  let write: EdgeWriteRequest;
  try {
    write = validateContract<EdgeWriteRequest>("EdgeWriteRequest", request, "admit edge");
  } catch (error) {
    return { ok: false, error: edgeLogError("MALFORMED_REQUEST", error instanceof Error ? error.message : String(error)) };
  }
  for (const [label, value] of [["actor", write.actor], ["added_by", write.added_by], ["from_task", write.from_task], ["to_task", write.to_task]] as const) {
    if (value.length === 0 || value.length > 200 || /\s/.test(value)) {
      return { ok: false, error: edgeLogError("MALFORMED_REQUEST", `${label} must be a non-empty identifier without whitespace`) };
    }
  }
  if (write.from_task === write.to_task) return { ok: false, error: edgeLogError("MALFORMED_REQUEST", "from_task cannot depend on itself") };
  return { ok: true, write };
}

function acquire(file: string): { ok: true; recovered: boolean } | { ok: false; error: EdgeLogError } {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const current = readLock(file);
    if (current && pidAlive(current.pid) && current.pid !== process.pid) {
      if (current.state === "rebuilding") return { ok: false, error: edgeLogError("INDEX_REBUILDING", "dependency index is rebuilding from the edge log") };
      if (Date.now() > deadline) return { ok: false, error: edgeLogError("EDGE_LOG_UNAVAILABLE", "dependency validator critical section is busy") };
      waitMs(20);
      continue;
    }
    if (current) discardDeadLock(file);
    else if (fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const recovered = current !== null && !pidAlive(current.pid);
    if (tryCreate(file, recovered ? "rebuilding" : "serving")) return { ok: true, recovered };
    waitMs(5);
  }
}

export function holdValidatorRebuild(workspace: string, hooks?: ValidatorHooks): { ok: true; safe_to_proceed: true; rebuilt_edges: number } | EdgeLogError {
  const file = validatorLockPath(workspace);
  const deadline = Date.now() + LOCK_WAIT_MS;
  let held = false;
  try {
    for (;;) {
      const current = readLock(file);
      if (current && pidAlive(current.pid) && current.pid !== process.pid) {
        if (current.state === "rebuilding") return edgeLogError("INDEX_REBUILDING", "dependency index is rebuilding from the edge log");
        if (Date.now() > deadline) return edgeLogError("EDGE_LOG_UNAVAILABLE", "dependency validator critical section is busy");
        waitMs(20);
        continue;
      }
      if (current) discardDeadLock(file);
      else if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      if (tryCreate(file, "rebuilding")) {
        held = true;
        break;
      }
      waitMs(5);
    }
    hooks?.duringRebuild?.();
    const log = new EdgeLog(workspace);
    try {
      const pairs = log.liveEdgePairs();
      DependencyIndex.fromPairs(pairs);
      return { ok: true, safe_to_proceed: true, rebuilt_edges: pairs.length };
    } finally {
      log.close();
    }
  } finally {
    if (held) releaseLock(file);
  }
}

export function admitDependencyEdge(options: {
  workspace: string;
  request: unknown;
  hooks?: ValidatorHooks;
}): EdgeLogResponse {
  const prepared = prepareWrite(options.request);
  if (!prepared.ok) return prepared.error;
  const file = validatorLockPath(options.workspace);
  const entry = acquire(file);
  if (!entry.ok) return entry.error;
  let log: EdgeLog | null = null;
  try {
    if (entry.recovered) options.hooks?.duringRebuild?.();
    log = new EdgeLog(options.workspace);
    const index = DependencyIndex.fromPairs(log.liveEdgePairs());
    if (entry.recovered) updateState(file, "serving");
    const denied = log.checkOwnership(prepared.write);
    if (denied) return denied;
    const check = index.wouldCreateCycle(prepared.write.from_task, prepared.write.to_task);
    if (check.cycle) {
      return edgeLogError("CYCLE_DETECTED", `adding ${prepared.write.from_task} -> ${prepared.write.to_task} would create a cycle`);
    }
    index.link(prepared.write.from_task, prepared.write.to_task);
    return log.add(prepared.write, { beforeCommit: options.hooks?.beforeCommit });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/OWNERSHIP_REJECTED/.test(message)) return edgeLogError("OWNERSHIP_REJECTED", message);
    return edgeLogError("EDGE_LOG_UNAVAILABLE", message);
  } finally {
    log?.close();
    releaseLock(file);
  }
}
