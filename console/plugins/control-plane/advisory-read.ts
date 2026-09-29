import fs from "node:fs";
import path from "node:path";
import {
  ADVISORY_READ_API_VERSION,
  type AdvisoryReadError,
  type AdvisoryReadErrorCode,
  type LeaseStatusResult,
  type TaskStateResult,
} from "./contracts";
import { ControlPlaneKernel, MalformedAdvisoryReadError } from "./kernel";
import { validateContract } from "./schemas";
import { LockHeldError, WorkspaceLock } from "./store";

export type AdvisoryReadResponse = LeaseStatusResult | TaskStateResult | AdvisoryReadError;

const ERROR_KEYS = ["api_version", "ok", "safe_to_proceed", "code", "message"] as const;

export function advisoryReadError(code: AdvisoryReadErrorCode, message: string): AdvisoryReadError {
  return validateContract<AdvisoryReadError>("AdvisoryReadError", {
    api_version: ADVISORY_READ_API_VERSION,
    ok: false,
    safe_to_proceed: false,
    code,
    message,
  }, "advisory read error");
}

function versionGate(input: unknown): AdvisoryReadError | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return advisoryReadError("MALFORMED_REQUEST", "request must be an object");
  if (!("api_version" in input)) return advisoryReadError("MALFORMED_REQUEST", "request is missing api_version");
  if ((input as { api_version?: unknown }).api_version !== ADVISORY_READ_API_VERSION) {
    return advisoryReadError("SCHEMA_VERSION_MISMATCH", `api_version must be ${ADVISORY_READ_API_VERSION}`);
  }
  return null;
}

export function queryLeaseStatus(kernel: ControlPlaneKernel, input: unknown): LeaseStatusResult | AdvisoryReadError {
  const version = versionGate(input);
  if (version) return version;
  try {
    const query = validateContract<{ api_version: typeof ADVISORY_READ_API_VERSION; query_scopes: string[] }>("LeaseStatusQuery", input, "lease status query");
    const leases = kernel.getLeaseStatus(query.query_scopes);
    return validateContract<LeaseStatusResult>("LeaseStatusResult", {
      api_version: ADVISORY_READ_API_VERSION,
      ok: true,
      safe_to_proceed: true,
      leases,
    }, "lease status");
  } catch (error) {
    if (error instanceof MalformedAdvisoryReadError || (error instanceof Error && /failed schema validation/.test(error.message))) {
      return advisoryReadError("MALFORMED_REQUEST", error.message);
    }
    return advisoryReadError("KERNEL_UNREACHABLE", error instanceof Error ? error.message : String(error));
  }
}

export function queryTaskState(kernel: ControlPlaneKernel, input: unknown): TaskStateResult | AdvisoryReadError {
  const version = versionGate(input);
  if (version) return version;
  try {
    const query = validateContract<{ api_version: typeof ADVISORY_READ_API_VERSION; task_ids: string[] }>("TaskStateQuery", input, "task state query");
    const tasks = kernel.getTaskState(query.task_ids);
    return validateContract<TaskStateResult>("TaskStateResult", {
      api_version: ADVISORY_READ_API_VERSION,
      ok: true,
      safe_to_proceed: true,
      tasks,
    }, "task state");
  } catch (error) {
    if (error instanceof MalformedAdvisoryReadError || (error instanceof Error && /failed schema validation/.test(error.message))) {
      return advisoryReadError("MALFORMED_REQUEST", error.message);
    }
    return advisoryReadError("KERNEL_UNREACHABLE", error instanceof Error ? error.message : String(error));
  }
}

export function advisoryHttpStatus(code: AdvisoryReadErrorCode) {
  switch (code) {
    case "MALFORMED_REQUEST": return 400;
    case "SCHEMA_VERSION_MISMATCH": return 409;
    case "LOCK_HELD_TIMEOUT": return 423;
    case "KERNEL_UNREACHABLE": return 503;
  }
}

export function executeAdvisoryRead(options: {
  command: "get-lease-status" | "get-task-state";
  workspace: string;
  request: unknown;
  lockTimeoutMs?: number;
}): AdvisoryReadResponse {
  const version = versionGate(options.request);
  if (version) return version;
  const contract = options.command === "get-lease-status" ? "LeaseStatusQuery" : "TaskStateQuery";
  try {
    validateContract(contract, options.request, "advisory read request");
  } catch (error) {
    return advisoryReadError("MALFORMED_REQUEST", error instanceof Error ? error.message : String(error));
  }

  const dbPath = path.join(options.workspace, ".autoclaw", "orchestrator", "control-plane.db");
  if (!fs.existsSync(dbPath) || !fs.statSync(dbPath).isFile()) {
    return advisoryReadError("KERNEL_UNREACHABLE", `control-plane database is not available at ${dbPath}`);
  }

  const lock = new WorkspaceLock(path.join(options.workspace, ".autoclaw", "orchestrator"));
  let kernel: ControlPlaneKernel | null = null;
  let held = false;
  try {
    lock.acquire(`headless:${options.command}`, { timeoutMs: options.lockTimeoutMs ?? 1000 });
    held = true;
    kernel = new ControlPlaneKernel(options.workspace);
    return options.command === "get-lease-status"
      ? queryLeaseStatus(kernel, options.request)
      : queryTaskState(kernel, options.request);
  } catch (error) {
    if (error instanceof LockHeldError) return advisoryReadError("LOCK_HELD_TIMEOUT", error.message);
    return advisoryReadError("KERNEL_UNREACHABLE", error instanceof Error ? error.message : String(error));
  } finally {
    kernel?.close();
    if (held) lock.release();
  }
}

export function advisoryErrorKeys() {
  return [...ERROR_KEYS];
}
