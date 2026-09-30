import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  EDGE_LOG_API_VERSION,
  type ClaimTaskRequest,
  type ClaimTaskResult,
  type DependentsQuery,
  type DependentsResult,
  type EdgeLogError,
  type EdgeLogErrorCode,
  type EdgeMutationResult,
  type EdgeWriteRequest,
  type StoredDependencyEdge,
} from "../control-plane/contracts";
import { validateContract } from "../control-plane/schemas";

export type EdgeLogCommand = "claim" | "add" | "remove" | "dependents";

export type EdgeLogResponse = ClaimTaskResult | EdgeMutationResult | DependentsResult | EdgeLogError;

export type EdgeLogRow = StoredDependencyEdge & { add_tag: number };

const ERROR_KEYS = ["api_version", "ok", "safe_to_proceed", "code", "message"] as const;

type OwnerRow = { task_id: string; agent_id: string; claimed_at: string };
type EdgeRow = EdgeLogRow;

function now() { return new Date().toISOString(); }

export function edgeLogPath(workspace: string) {
  return path.join(path.resolve(workspace), ".autoclaw", "orchestrator", "depgraph.db");
}

export function edgeLogError(code: EdgeLogErrorCode, message: string): EdgeLogError {
  return validateContract<EdgeLogError>("EdgeLogError", {
    api_version: EDGE_LOG_API_VERSION,
    ok: false,
    safe_to_proceed: false,
    code,
    message,
  }, "edge log error");
}

export function edgeLogErrorKeys() {
  return [...ERROR_KEYS];
}

export function edgeLogHttpStatus(code: EdgeLogErrorCode) {
  switch (code) {
    case "MALFORMED_REQUEST": return 400;
    case "OWNERSHIP_REJECTED": return 403;
    case "SCHEMA_VERSION_MISMATCH": return 409;
    case "EDGE_LOG_UNAVAILABLE": return 503;
  }
}

export function edgeLogCommandForPath(pathname: string): EdgeLogCommand | null {
  switch (pathname) {
    case "/api/orchestrator/v1/edges/claim": return "claim";
    case "/api/orchestrator/v1/edges": return "add";
    case "/api/orchestrator/v1/edges/remove": return "remove";
    case "/api/orchestrator/v1/edges/dependents": return "dependents";
    default: return null;
  }
}

function versionGate(input: unknown): EdgeLogError | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return edgeLogError("MALFORMED_REQUEST", "request must be an object");
  if (!("api_version" in input)) return edgeLogError("MALFORMED_REQUEST", "request is missing api_version");
  if ((input as { api_version?: unknown }).api_version !== EDGE_LOG_API_VERSION) {
    return edgeLogError("SCHEMA_VERSION_MISMATCH", `api_version must be ${EDGE_LOG_API_VERSION}`);
  }
  return null;
}

function identifierProblem(value: string, label: string) {
  if (value.length === 0 || value.length > 200 || /\s/.test(value)) return `${label} must be a non-empty identifier without whitespace`;
  return null;
}

function schemaFailure(error: unknown) {
  return error instanceof Error && /failed schema validation/.test(error.message);
}

function toStored(row: EdgeRow): StoredDependencyEdge {
  return {
    from_task: row.from_task,
    to_task: row.to_task,
    added_by: row.added_by,
    added_at: row.added_at,
    removed_at: row.removed_at,
    epoch: Number(row.epoch),
  };
}

export class EdgeLog {
  readonly dbPath: string;
  readonly db: DatabaseSync;

  constructor(workspace: string) {
    this.dbPath = edgeLogPath(workspace);
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    try {
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;");
      this.migrate();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close() { this.db.close(); }

  claim(input: unknown): ClaimTaskResult | EdgeLogError {
    const request = this.parse<ClaimTaskRequest>("ClaimTaskRequest", input, "claim task");
    if (!request.ok) return request.error;
    const problem = identifierProblem(request.value.actor, "actor") ?? identifierProblem(request.value.task_id, "task_id");
    if (problem) return edgeLogError("MALFORMED_REQUEST", problem);
    const claimedAt = now();
    return this.transaction(() => {
      const inserted = this.db.prepare("INSERT OR IGNORE INTO task_owners(task_id,agent_id,claimed_at) VALUES(?,?,?)")
        .run(request.value.task_id, request.value.actor, claimedAt);
      const owner = this.db.prepare("SELECT task_id,agent_id,claimed_at FROM task_owners WHERE task_id=?").get(request.value.task_id) as OwnerRow | undefined;
      if (!owner || owner.agent_id !== request.value.actor) {
        return edgeLogError("OWNERSHIP_REJECTED", `task ${request.value.task_id} is owned by ${owner?.agent_id ?? "nobody"}`);
      }
      return validateContract<ClaimTaskResult>("ClaimTaskResult", {
        api_version: EDGE_LOG_API_VERSION,
        ok: true,
        safe_to_proceed: true,
        task_id: owner.task_id,
        agent_id: owner.agent_id,
        created: Number(inserted.changes) > 0,
      }, "claim task result");
    });
  }

  add(input: unknown): EdgeMutationResult | EdgeLogError {
    return this.mutate("add", input);
  }

  remove(input: unknown): EdgeMutationResult | EdgeLogError {
    return this.mutate("remove", input);
  }

  dependents(input: unknown): DependentsResult | EdgeLogError {
    const request = this.parse<DependentsQuery>("DependentsQuery", input, "dependents query");
    if (!request.ok) return request.error;
    const problem = identifierProblem(request.value.task_id, "task_id");
    if (problem) return edgeLogError("MALFORMED_REQUEST", problem);
    const rows = this.db.prepare(`SELECT add_tag,from_task,to_task,added_by,added_at,removed_at,epoch
      FROM dependency_edges WHERE to_task=? AND removed_at IS NULL ORDER BY from_task,added_at,add_tag`).all(request.value.task_id) as EdgeRow[];
    return validateContract<DependentsResult>("DependentsResult", {
      api_version: EDGE_LOG_API_VERSION,
      ok: true,
      safe_to_proceed: true,
      task_id: request.value.task_id,
      dependents: rows.map(toStored),
    }, "dependents");
  }

  rows() {
    return this.db.prepare("SELECT add_tag,from_task,to_task,added_by,added_at,removed_at,epoch FROM dependency_edges ORDER BY add_tag").all() as EdgeRow[];
  }

  private mutate(operation: "add" | "remove", input: unknown): EdgeMutationResult | EdgeLogError {
    const request = this.parse<EdgeWriteRequest>("EdgeWriteRequest", input, `${operation} edge`);
    if (!request.ok) return request.error;
    const write = request.value;
    const problem = identifierProblem(write.actor, "actor")
      ?? identifierProblem(write.added_by, "added_by")
      ?? identifierProblem(write.from_task, "from_task")
      ?? identifierProblem(write.to_task, "to_task");
    if (problem) return edgeLogError("MALFORMED_REQUEST", problem);
    if (write.from_task === write.to_task) return edgeLogError("MALFORMED_REQUEST", "from_task cannot depend on itself");
    return this.transaction(() => {
      const rejected = this.rejectUnowned(write);
      if (rejected) return rejected;
      if (operation === "add") return this.insertEdge(write);
      return this.softRemove(write);
    });
  }

  private rejectUnowned(write: EdgeWriteRequest): EdgeLogError | null {
    if (write.actor !== write.added_by) {
      return edgeLogError("OWNERSHIP_REJECTED", "added_by does not match the authenticated actor");
    }
    const owner = this.db.prepare("SELECT agent_id FROM task_owners WHERE task_id=?").get(write.from_task) as { agent_id: string } | undefined;
    if (!owner) return edgeLogError("OWNERSHIP_REJECTED", `task ${write.from_task} has no owning agent`);
    if (owner.agent_id !== write.actor) {
      return edgeLogError("OWNERSHIP_REJECTED", `task ${write.from_task} is owned by ${owner.agent_id}`);
    }
    return null;
  }

  private insertEdge(write: EdgeWriteRequest): EdgeMutationResult | EdgeLogError {
    const live = this.liveEdge(write.from_task, write.to_task);
    if (live && live.added_by !== write.actor) {
      return edgeLogError("OWNERSHIP_REJECTED", `live edge ${write.from_task}->${write.to_task} is owned by ${live.added_by}`);
    }
    const epoch = this.epoch();
    const inserted = this.db.prepare(`INSERT OR IGNORE INTO dependency_edges(from_task,to_task,added_by,added_at,removed_at,epoch)
      VALUES(?,?,?,?,NULL,?)`).run(write.from_task, write.to_task, write.added_by, now(), epoch);
    const edge = this.liveEdge(write.from_task, write.to_task);
    if (!edge) throw new Error(`edge ${write.from_task}->${write.to_task} was not stored`);
    return this.mutation("add", Number(inserted.changes) > 0, edge);
  }

  private softRemove(write: EdgeWriteRequest): EdgeMutationResult | EdgeLogError {
    const live = this.liveEdge(write.from_task, write.to_task);
    if (!live) return this.mutation("remove", false, null);
    if (live.added_by !== write.actor) {
      return edgeLogError("OWNERSHIP_REJECTED", `live edge ${write.from_task}->${write.to_task} is owned by ${live.added_by}`);
    }
    const removedAt = now();
    const updated = this.db.prepare("UPDATE dependency_edges SET removed_at=? WHERE add_tag=? AND removed_at IS NULL").run(removedAt, live.add_tag);
    const row = this.db.prepare("SELECT add_tag,from_task,to_task,added_by,added_at,removed_at,epoch FROM dependency_edges WHERE add_tag=?").get(live.add_tag) as EdgeRow;
    return this.mutation("remove", Number(updated.changes) > 0, row);
  }

  private mutation(operation: "add" | "remove", applied: boolean, row: EdgeRow | null): EdgeMutationResult {
    return validateContract<EdgeMutationResult>("EdgeMutationResult", {
      api_version: EDGE_LOG_API_VERSION,
      ok: true,
      safe_to_proceed: true,
      operation,
      applied,
      edge: row ? toStored(row) : null,
    }, `${operation} edge result`);
  }

  private liveEdge(fromTask: string, toTask: string) {
    return this.db.prepare(`SELECT add_tag,from_task,to_task,added_by,added_at,removed_at,epoch
      FROM dependency_edges WHERE from_task=? AND to_task=? AND removed_at IS NULL`).get(fromTask, toTask) as EdgeRow | undefined;
  }

  private epoch() {
    const row = this.db.prepare("SELECT value FROM edge_log_meta WHERE key='epoch'").get() as { value: number } | undefined;
    const epoch = Number(row?.value);
    if (!Number.isInteger(epoch) || epoch < 1) throw new Error("edge log epoch is missing");
    return epoch;
  }

  private parse<T>(name: "ClaimTaskRequest" | "EdgeWriteRequest" | "DependentsQuery", input: unknown, label: string): { ok: true; value: T } | { ok: false; error: EdgeLogError } {
    const version = versionGate(input);
    if (version) return { ok: false, error: version };
    try {
      return { ok: true, value: validateContract<T>(name, input, label) };
    } catch (error) {
      if (schemaFailure(error)) return { ok: false, error: edgeLogError("MALFORMED_REQUEST", error instanceof Error ? error.message : String(error)) };
      throw error;
    }
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* RAISE(ABORT) may have closed the transaction */ }
      throw error;
    }
  }

  private migrate() {
    const version = Number(this.db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    if (version > 1) throw new Error(`edge log database version ${version} is newer than supported version 1`);
    if (version === 1) return;
    this.db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE edge_log_meta (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
      INSERT INTO edge_log_meta(key, value) VALUES ('epoch', 1);
      CREATE TABLE task_owners (
        task_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        claimed_at TEXT NOT NULL
      );
      CREATE TABLE dependency_edges (
        add_tag INTEGER PRIMARY KEY,
        from_task TEXT NOT NULL,
        to_task TEXT NOT NULL,
        added_by TEXT NOT NULL,
        added_at TEXT NOT NULL,
        removed_at TEXT,
        epoch INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_dependency_edges_live ON dependency_edges(from_task, to_task) WHERE removed_at IS NULL;
      CREATE INDEX idx_dependency_edges_reverse ON dependency_edges(to_task, from_task) WHERE removed_at IS NULL;
      CREATE TRIGGER task_owners_no_delete
      BEFORE DELETE ON task_owners
      BEGIN
        SELECT RAISE(ABORT, 'task ownership cannot be deleted');
      END;
      CREATE TRIGGER task_owners_no_reassign
      BEFORE UPDATE ON task_owners
      BEGIN
        SELECT RAISE(ABORT, 'task ownership cannot be reassigned')
        WHERE NEW.agent_id != OLD.agent_id OR NEW.task_id != OLD.task_id;
      END;
      CREATE TRIGGER dependency_edges_owner_insert
      BEFORE INSERT ON dependency_edges
      BEGIN
        SELECT RAISE(ABORT, 'OWNERSHIP_REJECTED')
        WHERE NOT EXISTS (
          SELECT 1 FROM task_owners WHERE task_id = NEW.from_task AND agent_id = NEW.added_by
        );
      END;
      CREATE TRIGGER dependency_edges_no_delete
      BEFORE DELETE ON dependency_edges
      BEGIN
        SELECT RAISE(ABORT, 'physical delete is forbidden');
      END;
      CREATE TRIGGER dependency_edges_identity
      BEFORE UPDATE ON dependency_edges
      BEGIN
        SELECT RAISE(ABORT, 'edge identity is immutable')
        WHERE NEW.add_tag != OLD.add_tag
          OR NEW.from_task != OLD.from_task
          OR NEW.to_task != OLD.to_task
          OR NEW.added_by != OLD.added_by
          OR NEW.added_at != OLD.added_at
          OR NEW.epoch != OLD.epoch;
      END;
      CREATE TRIGGER dependency_edges_remove_only
      BEFORE UPDATE OF removed_at ON dependency_edges
      BEGIN
        SELECT RAISE(ABORT, 'removed_at can only be set once')
        WHERE OLD.removed_at IS NOT NULL OR NEW.removed_at IS NULL;
      END;
      PRAGMA user_version = 1;
      COMMIT;
    `);
  }
}

const CONTRACT_FOR: Record<EdgeLogCommand, "ClaimTaskRequest" | "EdgeWriteRequest" | "DependentsQuery"> = {
  claim: "ClaimTaskRequest",
  add: "EdgeWriteRequest",
  remove: "EdgeWriteRequest",
  dependents: "DependentsQuery",
};

export function executeEdgeLog(options: {
  command: EdgeLogCommand;
  workspace: string;
  request: unknown;
}): EdgeLogResponse {
  const version = versionGate(options.request);
  if (version) return version;
  try {
    validateContract(CONTRACT_FOR[options.command], options.request, "edge log request");
  } catch (error) {
    return edgeLogError("MALFORMED_REQUEST", error instanceof Error ? error.message : String(error));
  }
  let log: EdgeLog | null = null;
  let result: EdgeLogResponse;
  try {
    log = new EdgeLog(options.workspace);
    switch (options.command) {
      case "claim": result = log.claim(options.request); break;
      case "add": result = log.add(options.request); break;
      case "remove": result = log.remove(options.request); break;
      case "dependents": result = log.dependents(options.request); break;
      default: {
        const unknown: never = options.command;
        result = edgeLogError("MALFORMED_REQUEST", `unknown edge log command ${String(unknown)}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = /OWNERSHIP_REJECTED/.test(message)
      ? edgeLogError("OWNERSHIP_REJECTED", message)
      : edgeLogError("EDGE_LOG_UNAVAILABLE", message);
  } finally {
    log?.close();
  }
  return result;
}
