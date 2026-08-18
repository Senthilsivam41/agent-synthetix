import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { AdapterConfig, HermesCompletionContract } from "./contracts";

export type JsonRpcNotification = { method: string; params: Record<string, unknown> };

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

function redactSecrets(value: string, config: AdapterConfig) {
  let redacted = value;
  for (const key of config.env_allowlist) {
    const secret = process.env[key];
    if (secret) redacted = redacted.split(secret).join(`[REDACTED:${key}]`);
  }
  return redacted;
}

function redactRecord(value: Record<string, unknown>, config: AdapterConfig) {
  return JSON.parse(redactSecrets(JSON.stringify(value), config)) as Record<string, unknown>;
}

export class HermesJsonRpcClient {
  pid: number | null = null;
  stdout = "";
  stderr = "";
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private readonly config: AdapterConfig;
  private nextId = 1;
  private closed = false;
  private spawnError = "";
  readonly wait: Promise<{ code: number | null }>;
  readonly notifications: JsonRpcNotification[] = [];
  private notificationHandler: ((note: JsonRpcNotification) => void) | null = null;

  constructor(config: AdapterConfig, cwd: string, onPid?: (pid: number) => void) {
    this.config = config;
    const executable = config.hermes_executable ?? "hermes";
    const args = [...(config.hermes_args ?? [])];
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("HERMES_FIXTURE_") && process.env[key] !== undefined) env[key] = process.env[key];
    }
    for (const key of config.env_allowlist) if (process.env[key] !== undefined) env[key] = process.env[key];
    this.child = spawn(executable, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    this.pid = this.child.pid ?? null;
    if (this.pid) onPid?.(this.pid);
    this.child.on("error", (error) => { this.spawnError = error.message; });
    this.child.stderr.on("data", (chunk) => { this.stderr += redactSecrets(String(chunk), config); });
    const reader = createInterface({ input: this.child.stdout });
    reader.on("line", (line) => this.onLine(line));
    this.wait = new Promise((resolve) => {
      this.child.on("close", (code) => {
        this.closed = true;
        for (const pending of this.pending.values()) pending.reject(new Error(this.spawnError || "Hermes JSON-RPC process closed"));
        this.pending.clear();
        resolve({ code });
      });
    });
  }

  onNotification(handler: (note: JsonRpcNotification) => void) {
    this.notificationHandler = handler;
  }

  request(method: string, params: unknown) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error("Hermes JSON-RPC process already closed"));
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  cancel(signal: NodeJS.Signals = "SIGTERM") {
    try { this.child.kill(signal); } catch { /* already exited */ }
  }

  private onLine(line: string) {
    this.stdout += `${redactSecrets(line, this.config)}\n`;
    let parsed: { jsonrpc?: string; id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message?: string } };
    try { parsed = JSON.parse(line); } catch {
      const pending = [...this.pending.values()];
      this.pending.clear();
      for (const item of pending) item.reject(new Error("invalid_json"));
      return;
    }
    if (parsed.method && parsed.id === undefined) {
      const note = { method: parsed.method, params: parsed.params ?? {} };
      this.notifications.push(note);
      this.notificationHandler?.(note);
      return;
    }
    if (typeof parsed.id === "number") {
      const pending = this.pending.get(parsed.id);
      if (!pending) return;
      this.pending.delete(parsed.id);
      if (parsed.error) pending.reject(new Error(parsed.error.message ?? "jsonrpc_error"));
      else pending.resolve(parsed.result);
    }
  }
}

export async function runHermesJsonRpcSession(options: {
  config: AdapterConfig;
  cwd: string;
  contract: HermesCompletionContract;
  timeoutMs: number;
  graceMs: number;
  onPid?: (pid: number) => void;
  onClient?: (client: HermesJsonRpcClient) => void;
  onApproval?: (requestId: string) => Promise<"approve" | "deny">;
}): Promise<{
  status: "completed" | "failed";
  failureCode: string | null;
  terminationReason: "completed" | "timeout" | "process_failure" | "invalid_json";
  pid: number | null;
  stdout: string;
  stderr: string;
  result: Record<string, unknown> | null;
  durationMs: number;
}> {
  const startedAt = Date.now();
  const client = new HermesJsonRpcClient(options.config, options.cwd, options.onPid);
  options.onClient?.(client);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    client.cancel("SIGTERM");
    setTimeout(() => client.cancel("SIGKILL"), options.graceMs).unref();
  }, options.timeoutMs);
  let startResult: Record<string, unknown> | null = null;
  try {
    await client.request("initialize", { protocol: "synthetix-hermes-jsonrpc/1", worktree_path: options.cwd, contract: options.contract });
    client.onNotification(async (note) => {
      if (note.method === "run.approval_required") {
        const requestId = String(note.params.request_id ?? "");
        const decision = options.onApproval ? await options.onApproval(requestId) : "deny";
        try { await client.request("run.approve", { request_id: requestId, decision }); } catch { /* process may already be closing */ }
      }
    });
    startResult = redactRecord((await client.request("run.start", { contract: options.contract })) as Record<string, unknown>, options.config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.wait;
    clearTimeout(timeout);
    const durationMs = Date.now() - startedAt;
    if (timedOut) return { status: "failed", failureCode: "timeout", terminationReason: "timeout", pid: client.pid, stdout: client.stdout, stderr: client.stderr, result: null, durationMs };
    if (message === "invalid_json") return { status: "failed", failureCode: "invalid_json", terminationReason: "invalid_json", pid: client.pid, stdout: client.stdout, stderr: client.stderr, result: null, durationMs };
    return { status: "failed", failureCode: "process_failure", terminationReason: "process_failure", pid: client.pid, stdout: client.stdout, stderr: `${client.stderr}${message}`, result: null, durationMs };
  }
  const closed = await client.wait;
  clearTimeout(timeout);
  const durationMs = Date.now() - startedAt;
  if (timedOut) return { status: "failed", failureCode: "timeout", terminationReason: "timeout", pid: client.pid, stdout: client.stdout, stderr: client.stderr, result: startResult, durationMs };
  if (closed.code !== 0 && closed.code !== null && startResult?.status !== "completed") {
    return { status: "failed", failureCode: "process_failure", terminationReason: "process_failure", pid: client.pid, stdout: client.stdout, stderr: client.stderr, result: startResult, durationMs };
  }
  if (startResult?.status === "completed") {
    return { status: "completed", failureCode: null, terminationReason: "completed", pid: client.pid, stdout: client.stdout, stderr: client.stderr, result: startResult, durationMs };
  }
  return { status: "failed", failureCode: "process_failure", terminationReason: "process_failure", pid: client.pid, stdout: client.stdout, stderr: client.stderr, result: startResult, durationMs };
}
