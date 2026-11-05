import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { EDGE_LOG_API_VERSION, type DependencyNotifyRequest, type DependencyNotifyResult, type DependencySignal, type EdgeLogError } from "../control-plane/contracts";
import { validateContract } from "../control-plane/schemas";
import { EdgeLog, edgeLogError, edgeLogPath } from "./edge-log";

type LiveDependent = { from_task: string; epoch: number };
type StoredWriteback = { writeback_id: string; originating_task: string; actor: string };
type StoredNotice = { notified_task: string; agent_id: string; edge_epoch: number; message_id: string };

export function dependencyNotificationLogPath(workspace: string) {
  return path.join(path.resolve(workspace), ".autoclaw", "orchestrator", "comms", "dependency-notifications.jsonl");
}

export function notifyDependents(options: { workspace: string; request: unknown }): DependencyNotifyResult | EdgeLogError {
  const prepared = prepareNotify(options.request);
  if (!prepared.ok) return prepared.error;
  if (!fs.existsSync(edgeLogPath(options.workspace))) {
    return edgeLogError("OWNERSHIP_REJECTED", `task ${prepared.request.task_id} has no owning agent`);
  }
  const log = new EdgeLog(options.workspace);
  const written: string[] = [];
  let committed = false;
  try {
    const owner = log.db.prepare("SELECT agent_id FROM task_owners WHERE task_id=?").get(prepared.request.task_id) as { agent_id: string } | undefined;
    if (!owner || owner.agent_id !== prepared.request.actor) {
      return edgeLogError("OWNERSHIP_REJECTED", owner
        ? `task ${prepared.request.task_id} is owned by ${owner.agent_id}`
        : `task ${prepared.request.task_id} has no owning agent`);
    }
    log.db.exec("BEGIN IMMEDIATE");
    const existing = log.db.prepare("SELECT writeback_id,originating_task,actor FROM dependency_writebacks WHERE writeback_id=?").get(prepared.request.writeback_id) as StoredWriteback | undefined;
    if (existing) {
      if (existing.originating_task !== prepared.request.task_id) {
        log.db.exec("ROLLBACK");
        return edgeLogError("MALFORMED_REQUEST", `writeback ${prepared.request.writeback_id} was already recorded for ${existing.originating_task}`);
      }
      if (existing.actor !== prepared.request.actor) {
        log.db.exec("ROLLBACK");
        return edgeLogError("OWNERSHIP_REJECTED", `writeback ${prepared.request.writeback_id} was recorded by ${existing.actor}`);
      }
      const notified = readNotices(log, prepared.request.writeback_id);
      log.db.exec("COMMIT");
      committed = true;
      return result(prepared.request, true, notified);
    }
    const dependents = log.db.prepare(`SELECT from_task,epoch FROM dependency_edges
      WHERE to_task=? AND removed_at IS NULL ORDER BY from_task,add_tag`).all(prepared.request.task_id) as LiveDependent[];
    const notifiedAt = new Date().toISOString();
    const notices: StoredNotice[] = [];
    for (const dependent of dependents) {
      const dependentOwner = log.db.prepare("SELECT agent_id FROM task_owners WHERE task_id=?").get(dependent.from_task) as { agent_id: string } | undefined;
      if (!dependentOwner) return rollback(log, edgeLogError("OWNERSHIP_REJECTED", `task ${dependent.from_task} has no owning agent`), written);
      const unsafe = unsafeInboxName(dependentOwner.agent_id);
      if (unsafe) return rollback(log, edgeLogError("MALFORMED_REQUEST", unsafe), written);
      notices.push({
        notified_task: dependent.from_task,
        agent_id: dependentOwner.agent_id,
        edge_epoch: Number(dependent.epoch),
        message_id: `dependency_invalidated:${prepared.request.writeback_id}:${dependent.from_task}`,
      });
    }
    log.db.prepare("INSERT INTO dependency_writebacks(writeback_id,originating_task,actor,session_id,notified_at) VALUES(?,?,?,?,?)")
      .run(prepared.request.writeback_id, prepared.request.task_id, prepared.request.actor, prepared.request.session_id, notifiedAt);
    const insertNotice = log.db.prepare("INSERT INTO dependency_notifications(writeback_id,notified_task,agent_id,edge_epoch,message_id) VALUES(?,?,?,?,?)");
    for (const notice of notices) {
      insertNotice.run(prepared.request.writeback_id, notice.notified_task, notice.agent_id, notice.edge_epoch, notice.message_id);
      written.push(writeSignal(options.workspace, prepared.request, notice, notifiedAt));
    }
    log.db.exec("COMMIT");
    committed = true;
    if (notices.length) appendProjection(options.workspace, prepared.request, notices, notifiedAt);
    return result(prepared.request, false, notices);
  } catch (error) {
    if (!committed) {
      try { log.db.exec("ROLLBACK"); } catch { /* the transaction may already be closed */ }
      for (const file of written) {
        try { fs.unlinkSync(file); } catch { /* the signal was not left behind */ }
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/OWNERSHIP_REJECTED/.test(message)) return edgeLogError("OWNERSHIP_REJECTED", message);
    return edgeLogError("EDGE_LOG_UNAVAILABLE", message);
  } finally {
    log.close();
  }
}

function prepareNotify(request: unknown): { ok: true; request: DependencyNotifyRequest } | { ok: false; error: EdgeLogError } {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { ok: false, error: edgeLogError("MALFORMED_REQUEST", "request must be an object") };
  }
  if (!("api_version" in request)) return { ok: false, error: edgeLogError("MALFORMED_REQUEST", "request is missing api_version") };
  if ((request as { api_version?: unknown }).api_version !== EDGE_LOG_API_VERSION) {
    return { ok: false, error: edgeLogError("SCHEMA_VERSION_MISMATCH", `api_version must be ${EDGE_LOG_API_VERSION}`) };
  }
  let parsed: DependencyNotifyRequest;
  try {
    parsed = validateContract<DependencyNotifyRequest>("DependencyNotifyRequest", request, "notify dependents");
  } catch (error) {
    return { ok: false, error: edgeLogError("MALFORMED_REQUEST", error instanceof Error ? error.message : String(error)) };
  }
  for (const [label, value] of [["actor", parsed.actor], ["session_id", parsed.session_id], ["task_id", parsed.task_id], ["writeback_id", parsed.writeback_id]] as const) {
    if (value.length === 0 || value.length > 200 || /\s/.test(value)) {
      return { ok: false, error: edgeLogError("MALFORMED_REQUEST", `${label} must be a non-empty identifier without whitespace`) };
    }
  }
  return { ok: true, request: parsed };
}

function readNotices(log: EdgeLog, writebackId: string) {
  return log.db.prepare(`SELECT notified_task,agent_id,edge_epoch,message_id FROM dependency_notifications
    WHERE writeback_id=? ORDER BY notified_task`).all(writebackId) as StoredNotice[];
}

function result(request: DependencyNotifyRequest, replayed: boolean, notified: StoredNotice[]): DependencyNotifyResult {
  return validateContract<DependencyNotifyResult>("DependencyNotifyResult", {
    api_version: EDGE_LOG_API_VERSION,
    ok: true,
    safe_to_proceed: true,
    task_id: request.task_id,
    writeback_id: request.writeback_id,
    replayed,
    notified: notified.map((notice) => ({
      notified_task: notice.notified_task,
      agent_id: notice.agent_id,
      edge_epoch: Number(notice.edge_epoch),
      message_id: notice.message_id,
    })),
  }, "notify dependents result");
}

function rollback(log: EdgeLog, error: EdgeLogError, written: string[]) {
  try { log.db.exec("ROLLBACK"); } catch { /* already closed */ }
  for (const file of written) {
    try { fs.unlinkSync(file); } catch { /* nothing was written */ }
  }
  written.splice(0);
  return error;
}

function unsafeInboxName(agentId: string) {
  if (agentId.length === 0 || agentId === "." || agentId === ".." || agentId.includes("/") || agentId.includes("\\")) {
    return `agent ${agentId} is not a single inbox directory`;
  }
  return null;
}

function writeSignal(workspace: string, request: DependencyNotifyRequest, notice: StoredNotice, timestamp: string) {
  const inbox = path.join(path.resolve(workspace), ".autoclaw", "orchestrator", "comms", "inboxes", notice.agent_id);
  fs.mkdirSync(inbox, { recursive: true });
  const signal = validateContract<DependencySignal>("DependencySignal", {
    id: notice.message_id,
    session_id: request.session_id,
    from: request.actor,
    to: notice.agent_id,
    type: "dependency_invalidated",
    timestamp,
    originating_task: request.task_id,
    notified_task: notice.notified_task,
    edge_epoch: notice.edge_epoch,
  }, "dependency signal");
  const digest = createHash("sha256").update(`${request.writeback_id}\0${notice.notified_task}`).digest("hex").slice(0, 20);
  const file = path.join(inbox, `dependency_invalidated-${digest}.json`);
  fs.writeFileSync(file, `${JSON.stringify(signal, null, 2)}\n`, "utf8");
  return file;
}

function appendProjection(workspace: string, request: DependencyNotifyRequest, notices: StoredNotice[], timestamp: string) {
  const file = dependencyNotificationLogPath(workspace);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = notices.map((notice) => JSON.stringify({
    writeback_id: request.writeback_id,
    originating_task: request.task_id,
    notified_task: notice.notified_task,
    agent_id: notice.agent_id,
    edge_epoch: notice.edge_epoch,
    message_id: notice.message_id,
    session_id: request.session_id,
    notified_at: timestamp,
  }));
  fs.appendFileSync(file, `${lines.join("\n")}\n`, "utf8");
}
