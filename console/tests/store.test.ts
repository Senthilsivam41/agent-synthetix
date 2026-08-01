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
    expect(store.db.prepare("PRAGMA user_version").get()?.user_version).toBe(1);
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
});
