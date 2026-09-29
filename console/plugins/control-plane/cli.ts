#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { executeAdvisoryRead } from "./advisory-read";
import { ControlPlaneKernel } from "./kernel";
import { WorkspaceLock } from "./store";

function flag(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string) {
  const value = flag(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function workspaceRoot() {
  const explicit = flag("workspace");
  if (explicit) return path.resolve(explicit);
  try { return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), encoding: "utf8" }).trim(); }
  catch { throw new Error("run inside a Git workspace or pass --workspace <path>"); }
}

function print(value: unknown) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

function advisoryRequest(command: "get-lease-status" | "get-task-state") {
  const requestPath = flag("request");
  if (requestPath) return JSON.parse(fs.readFileSync(requestPath, "utf8")) as unknown;
  const request: Record<string, unknown> = { api_version: flag("api-version") ?? "1.0" };
  if (command === "get-lease-status") {
    const scopes = flag("scopes");
    if (scopes !== undefined) request.query_scopes = scopes.split(",").map((scope) => scope.trim()).filter(Boolean);
  } else {
    const tasks = flag("tasks");
    if (tasks !== undefined) request.task_ids = tasks.split(",").map((task) => task.trim()).filter(Boolean);
  }
  return request;
}

async function main() {
  const command = process.argv[2];
  if (!command) throw new Error("usage: control-plane <init|plan|run|retry|ingest|reconcile|status|cancel|cleanup|register-agent|register-adapter|create-session|get-lease-status|get-task-state> [options]");
  const workspace = workspaceRoot();
  if (command === "get-lease-status" || command === "get-task-state") {
    let request: unknown;
    try { request = advisoryRequest(command); }
    catch (error) { request = { api_version: flag("api-version") ?? "1.0", invalid_request: error instanceof Error ? error.message : String(error) }; }
    const result = executeAdvisoryRead({ command, workspace, request });
    print(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const lock = new WorkspaceLock(path.join(workspace, ".autoclaw", "orchestrator"));
  lock.acquire(`headless:${command}`);
  const kernel = new ControlPlaneKernel(workspace);
  try {
    let result: unknown;
    try {
      if (command === "init") result = await kernel.init();
      else {
        await kernel.init();
        switch (command) {
          case "plan": result = await kernel.plan(required("manifest")); break;
          case "run": {
            const assignmentId = required("assignment");
            const assignment = kernel.assignment(assignmentId);
            const sessionId = flag("session") ?? kernel.activeSessionForAgent(assignment.assigned_agent_id).session_id;
            result = await kernel.run(assignmentId, sessionId); break;
          }
          case "ingest": result = await kernel.ingest(); break;
          case "reconcile": result = await kernel.reconcile(); break;
          case "status": result = kernel.status(); break;
          case "cancel": result = kernel.cancel(required("execution")); break;
          case "retry": result = await kernel.retry(required("execution"), flag("session")); break;
          case "cleanup": result = kernel.cleanup(); break;
          case "register-agent": result = kernel.registerAgent({ agent_id: flag("id"), display_name: required("name"), adapter_type: flag("adapter") ?? "host", capabilities: (flag("capabilities") ?? "").split(",").filter(Boolean) }); break;
          case "register-adapter": result = kernel.registerAdapter({ adapter_id: flag("id"), adapter_type: required("adapter"), display_name: required("name"), version: required("version"), config_ref: flag("config-ref"), health: (flag("health") as "unknown" | "healthy" | "degraded" | "unavailable" | undefined), capabilities: (flag("capabilities") ?? "").split(",").filter(Boolean), source: (flag("source") as "declared" | "probed" | "compatibility" | undefined), ttl_seconds: Number(flag("ttl") ?? 3600) }); break;
          case "create-session": result = kernel.createSession(required("agent"), Number(flag("ttl") ?? 3600)); break;
          default: throw new Error(`unknown command ${command}`);
        }
      }
      await kernel.recordCommand(command, {}, "processed");
      print(result);
    } catch (error) {
      await kernel.recordCommand(command, { error: error instanceof Error ? error.message : String(error) }, "failed");
      throw error;
    }
  } finally {
    kernel.close();
    lock.release();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
