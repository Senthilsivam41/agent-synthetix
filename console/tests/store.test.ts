import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../plugins/control-plane/contracts";
import { ControlPlaneStore, WorkspaceLock } from "../plugins/control-plane/store";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true }); });

describe("authoritative store", () => {
  it("initializes WAL, migrations, idempotent events, and immutable exports", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-store-")); roots.push(root);
    const store = new ControlPlaneStore(root);
    expect(store.db.prepare("PRAGMA journal_mode").get()?.journal_mode).toBe("wal");
    expect(store.db.prepare("PRAGMA user_version").get()?.user_version).toBe(3);
    const event = { schema_version: SCHEMA_VERSION, event_id: randomUUID(), event_type: "test", execution_id: "", assignment_id: "", agent_id: "agent", session_id: "session", occurred_at: new Date().toISOString(), payload: { ok: true } };
    expect(store.insertEvent(event)).toBe(true);
    expect(store.insertEvent(event)).toBe(false);
    expect(() => store.transaction(() => {
      store.db.prepare("INSERT INTO settings(key,value) VALUES('crash_probe','written')").run();
      throw new Error("simulated crash");
    })).toThrow(/simulated crash/);
    expect(store.db.prepare("SELECT value FROM settings WHERE key='crash_probe'").get()).toBeUndefined();
    await store.exportPendingEvents();
    const exported = path.join(store.root, "events", event.occurred_at.slice(0, 10), `${event.event_id}.json`);
    expect(JSON.parse(await fsp.readFile(exported, "utf8")).payload).toEqual({ ok: true });
    store.close();
  });

  it("rejects a concurrent workspace writer with owner information", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-lock-")); roots.push(root);
    const first = new WorkspaceLock(root); const second = new WorkspaceLock(root);
    first.acquire("first");
    expect(() => second.acquire("second")).toThrow(/first/);
    first.release();
  });

  it("persists idempotent adapter registrations and time-bounded capability snapshots", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-adapter-store-")); roots.push(root);
    const store = new ControlPlaneStore(root);
    const registration = { schema_version: SCHEMA_VERSION, adapter_id: "fixture", adapter_type: "fixture", display_name: "Fixture", version: "1", config_ref: null, health: "healthy" as const, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const snapshot = { schema_version: SCHEMA_VERSION, snapshot_id: randomUUID(), adapter_id: "fixture", adapter_type: "fixture", adapter_version: "1", capabilities: ["workspace-write"], captured_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), source: "declared" as const, fingerprint: "a".repeat(64) };
    store.transaction(() => { store.upsertAdapterRegistration(registration); store.insertCapabilitySnapshot(snapshot); store.insertCapabilitySnapshot(snapshot); });
    expect(JSON.parse(String(store.adapterRegistration("fixture")?.registration_json)).adapter_id).toBe("fixture");
    expect(JSON.parse(String(store.latestCapabilitySnapshot("fixture")?.snapshot_json)).capabilities).toEqual(["workspace-write"]);
    expect(store.db.prepare("SELECT COUNT(*) AS count FROM capability_snapshots").get()?.count).toBe(1);
    store.close();
  });

  it("persists Hermes external-run correlation for restart/reconcile", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-external-run-")); roots.push(root);
    const store = new ControlPlaneStore(root);
    const record = {
      schema_version: SCHEMA_VERSION,
      external_run_id: "ext-run-1",
      execution_id: "exec-1",
      assignment_id: "assign-1",
      adapter_type: "hermes" as const,
      external_session_id: "sess-1",
      pid: 42,
      version: "0.20.0",
      worktree_path: "/tmp/worktree",
      contract: {
        schema_version: SCHEMA_VERSION,
        contract_id: "c1",
        assignment_id: "assign-1",
        worktree_path: "/tmp/worktree",
        outcome: "goal",
        verification: { acceptance_criteria: [], gates: [] },
        constraints: { required_capabilities: [], ambiguous_scopes: [] },
        boundaries: { read_scopes: ["src/**"], write_scopes: ["src/**"] },
        stop_when: ["leave write scopes"],
        correlation: { task_id: "t", base_commit: "base", assigned_agent_id: "worker" },
        assignment_fingerprint: "f".repeat(64),
      },
      assignment_fingerprint: "f".repeat(64),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      termination_reason: "completed",
    };
    store.upsertExternalRun(record);
    store.upsertExternalRun({ ...record, completed_at: "2026-08-18T00:00:00.000Z" });
    expect(JSON.parse(String(store.externalRunForExecution("exec-1")?.record_json)).external_run_id).toBe("ext-run-1");
    expect(JSON.parse(String(store.externalRunForExecution("exec-1")?.record_json)).completed_at).toBe("2026-08-18T00:00:00.000Z");
    store.close();
  });
});
