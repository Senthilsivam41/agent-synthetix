import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { AdapterConfig, TaskAssignment } from "./contracts";

export type AdapterResult = {
  status: "completed" | "planning_failed" | "execution_failed" | "failed";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  pid: number | null;
  result: Record<string, unknown> | null;
  failureCode: string | null;
  durationMs: number;
  terminationReason: "completed" | "router_failure" | "timeout" | "process_failure" | "invalid_json";
};

function redactSecrets(value: string, config: AdapterConfig) {
  let redacted = value;
  for (const key of config.env_allowlist) {
    const secret = process.env[key];
    if (secret) redacted = redacted.split(secret).join(`[REDACTED:${key}]`);
  }
  return redacted;
}

export async function runAdapter(config: AdapterConfig, assignment: TaskAssignment, worktreePath: string, onPid?: (pid: number) => void): Promise<AdapterResult> {
  if (config.mode === "mock") {
    for (const [relative, contents] of Object.entries(config.mock_changes ?? {})) {
      const target = path.resolve(worktreePath, relative);
      if (target !== worktreePath && !target.startsWith(`${path.resolve(worktreePath)}${path.sep}`)) throw new Error(`mock change escapes worktree: ${relative}`);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, contents, "utf8");
    }
    return { status: "completed", stdout: JSON.stringify({ status: "completed", mock: true }), stderr: "", exitCode: 0, pid: null, result: { status: "completed", mock: true }, failureCode: null, durationMs: 0, terminationReason: "completed" };
  }
  const shim = path.join(path.dirname(fileURLToPath(import.meta.url)), "dual_router_shim.py");
  const env: NodeJS.ProcessEnv = {};
  for (const key of config.env_allowlist) if (process.env[key] !== undefined) env[key] = process.env[key];
  env.PATH = process.env.PATH;
  const payload = JSON.stringify({ assignment, worktree_path: worktreePath, config: { router_path: config.router_path, planner_model: config.planner_model, executor_model: config.executor_model } });
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(config.python_executable, [shim], { cwd: worktreePath, env, stdio: ["pipe", "pipe", "pipe"] });
    if (child.pid) onPid?.(child.pid);
    let stdout = "";
    let stderr = "";
    let spawnError = "";
    child.on("error", (error) => { spawnError = error.message; });
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.stdin.on("error", () => { /* spawn failure is classified on close */ });
    child.stdin.end(payload);
    let timedOut = false;
    let closed = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => { if (!closed) child.kill("SIGKILL"); }, config.termination_grace_ms).unref();
    }, config.timeout_ms);
    child.on("close", (code) => {
      closed = true;
      clearTimeout(timeout);
      stdout = redactSecrets(stdout, config);
      stderr = redactSecrets(stderr, config);
      const durationMs = Date.now() - startedAt;
      if (timedOut) return resolve({ status: "failed", stdout, stderr, exitCode: code, pid: child.pid ?? null, result: null, failureCode: "timeout", durationMs, terminationReason: "timeout" });
      if (code !== 0 || spawnError) return resolve({ status: "failed", stdout, stderr: `${stderr}${spawnError}`, exitCode: code, pid: child.pid ?? null, result: null, failureCode: "process_failure", durationMs, terminationReason: "process_failure" });
      try {
        const parsed = JSON.parse(stdout) as Record<string, unknown>;
        const rawStatus = String(parsed.status ?? "failed");
        const status: AdapterResult["status"] = ["completed", "planning_failed", "execution_failed", "failed"].includes(rawStatus) ? rawStatus as AdapterResult["status"] : "failed";
        resolve({ status, stdout, stderr, exitCode: code, pid: child.pid ?? null, result: parsed, failureCode: status === "completed" ? null : status, durationMs, terminationReason: status === "completed" ? "completed" : "router_failure" });
      } catch {
        resolve({ status: "failed", stdout, stderr, exitCode: code, pid: child.pid ?? null, result: null, failureCode: "invalid_json", durationMs, terminationReason: "invalid_json" });
      }
    });
  });
}
