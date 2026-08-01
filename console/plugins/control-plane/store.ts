import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { ExecutionEvent, ExecutionState, GuardFinding } from "./contracts";

export class WorkspaceLock {
  private fd: number | null = null;
  readonly lockPath: string;

  constructor(root: string) {
    this.lockPath = path.join(root, "control-plane.lock");
  }

  acquire(owner: string) {
    fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });
    const claim = () => {
      this.fd = fs.openSync(this.lockPath, "wx", 0o600);
      fs.writeFileSync(this.fd, JSON.stringify({ pid: process.pid, owner, acquired_at: new Date().toISOString() }));
    };
    try {
      claim();
    } catch (error) {
      const current = fs.existsSync(this.lockPath) ? fs.readFileSync(this.lockPath, "utf8") : "unknown";
      try {
        const pid = Number((JSON.parse(current) as { pid?: number }).pid);
        process.kill(pid, 0);
      } catch {
        try { fs.unlinkSync(this.lockPath); } catch { /* raced with owner cleanup */ }
        try { claim(); return; } catch { /* another writer won the retry */ }
      }
      throw new Error(`control-plane writer already active: ${current}`, { cause: error });
    }
  }

  release() {
    if (this.fd !== null) fs.closeSync(this.fd);
    this.fd = null;
    try { fs.unlinkSync(this.lockPath); } catch { /* already removed */ }
  }
}

export class ControlPlaneStore {
  readonly root: string;
  readonly dbPath: string;
  readonly db: DatabaseSync;

  constructor(workspaceRoot: string) {
    this.root = path.join(workspaceRoot, ".autoclaw", "orchestrator");
    fs.mkdirSync(this.root, { recursive: true });
    this.dbPath = path.join(this.root, "control-plane.db");
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.migrate();
  }

  close() { this.db.close(); }

  private migrate() {
    const version = Number(this.db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    if (version > 1) throw new Error(`control-plane database version ${version} is newer than supported version 1`);
    if (version === 0) {
      this.db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE agents (agent_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE sessions (session_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(agent_id), issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL);
        CREATE TABLE assignments (assignment_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, sprint_id TEXT, assignment_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE executions (execution_id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES assignments(assignment_id), worker_agent_id TEXT NOT NULL, worker_session_id TEXT NOT NULL, state TEXT NOT NULL, worktree_path TEXT, branch_name TEXT, pid INTEGER, started_at TEXT, updated_at TEXT NOT NULL, completed_at TEXT, failure_code TEXT);
        CREATE TABLE scope_leases (lease_id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, execution_id TEXT NOT NULL REFERENCES executions(execution_id), scope TEXT NOT NULL, acquired_at TEXT NOT NULL, expires_at TEXT NOT NULL, released_at TEXT);
        CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, event_type TEXT NOT NULL, execution_id TEXT, assignment_id TEXT, agent_id TEXT NOT NULL, session_id TEXT NOT NULL, occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL, exported_at TEXT);
        CREATE TABLE evidence (evidence_id TEXT PRIMARY KEY, execution_id TEXT NOT NULL REFERENCES executions(execution_id), evidence_json TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE reviews (review_id TEXT PRIMARY KEY, execution_id TEXT NOT NULL REFERENCES executions(execution_id), request_json TEXT NOT NULL, verdict_json TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE findings (finding_id TEXT PRIMARY KEY, execution_id TEXT, severity TEXT NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE commands (command_id TEXT PRIMARY KEY, command TEXT NOT NULL, args_json TEXT NOT NULL, status TEXT NOT NULL, enqueued_at TEXT NOT NULL, processed_at TEXT);
        CREATE TABLE imports (source_path TEXT PRIMARY KEY, source_hash TEXT NOT NULL, imported_at TEXT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO settings(key,value) VALUES('guard_mode','enforce');
        CREATE INDEX idx_executions_state ON executions(state);
        CREATE INDEX idx_events_execution ON events(execution_id, seq);
        CREATE INDEX idx_leases_active ON scope_leases(released_at, expires_at);
        PRAGMA user_version=1;
        COMMIT;
      `);
    }
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  insertEvent(event: ExecutionEvent) {
    const result = this.db.prepare(`INSERT OR IGNORE INTO events
      (event_id,event_type,execution_id,assignment_id,agent_id,session_id,occurred_at,payload_json)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      event.event_id, event.event_type, event.execution_id, event.assignment_id,
      event.agent_id, event.session_id, event.occurred_at, JSON.stringify(event.payload),
    );
    return result.changes > 0;
  }

  transition(executionId: string, state: ExecutionState, fields: { pid?: number | null; failureCode?: string | null; completedAt?: string | null } = {}) {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE executions SET state=?, pid=COALESCE(?,pid), failure_code=COALESCE(?,failure_code), completed_at=COALESCE(?,completed_at), updated_at=? WHERE execution_id=?`)
      .run(state, fields.pid ?? null, fields.failureCode ?? null, fields.completedAt ?? null, now, executionId);
  }

  addFinding(finding: GuardFinding) {
    this.db.prepare(`INSERT OR IGNORE INTO findings (finding_id,execution_id,severity,category,message,status,created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(finding.finding_id, finding.execution_id, finding.severity, finding.category, finding.message, finding.status, finding.created_at);
  }

  setting(key: string, fallback: string) {
    const row = this.db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value?: string } | undefined;
    return row?.value ?? fallback;
  }

  setSetting(key: string, value: string) {
    this.db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
  }

  async exportPendingEvents() {
    const rows = this.db.prepare("SELECT * FROM events WHERE exported_at IS NULL ORDER BY seq LIMIT 200").all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const date = String(row.occurred_at).slice(0, 10);
      const dir = path.join(this.root, "events", date);
      await fsp.mkdir(dir, { recursive: true });
      const target = path.join(dir, `${row.event_id}.json`);
      const temp = `${target}.${randomUUID()}.tmp`;
      const contents = `${JSON.stringify({ ...row, payload: JSON.parse(String(row.payload_json)), payload_json: undefined }, null, 2)}\n`;
      await fsp.writeFile(temp, contents, { mode: 0o600 });
      try {
        await fsp.link(temp, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = JSON.parse(await fsp.readFile(target, "utf8")) as { event_id?: string };
        if (existing.event_id !== row.event_id) throw new Error(`immutable event export collision at ${target}`);
      } finally {
        await fsp.rm(temp, { force: true });
      }
      this.db.prepare("UPDATE events SET exported_at=? WHERE event_id=?").run(new Date().toISOString(), String(row.event_id));
    }
  }

  importHash(sourcePath: string, contents: string) {
    const hash = createHash("sha256").update(contents).digest("hex");
    const old = this.db.prepare("SELECT source_hash FROM imports WHERE source_path=?").get(sourcePath) as { source_hash?: string } | undefined;
    if (old?.source_hash === hash) return false;
    this.db.prepare("INSERT INTO imports(source_path,source_hash,imported_at) VALUES(?,?,?) ON CONFLICT(source_path) DO UPDATE SET source_hash=excluded.source_hash, imported_at=excluded.imported_at")
      .run(sourcePath, hash, new Date().toISOString());
    return true;
  }
}
