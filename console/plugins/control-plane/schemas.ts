import { SCHEMA_VERSION, type ExecutionEvent, type ReviewVerdict } from "./contracts";

export const CONTRACT_SCHEMAS = {
  AgentProfile: objectSchema(["schema_version", "agent_id", "display_name", "adapter_type", "capabilities", "status", "created_at", "updated_at"]),
  AgentSession: objectSchema(["schema_version", "session_id", "agent_id", "issued_at", "expires_at", "status"]),
  TaskAssignment: objectSchema(["schema_version", "assignment_id", "task_id", "title", "goal", "dependencies", "read_scopes", "write_scopes", "acceptance_criteria", "required_capabilities", "gates", "base_commit", "assigned_agent_id", "reviewer_agent_id", "created_at"]),
  ExecutionEvent: objectSchema(["schema_version", "event_id", "event_type", "execution_id", "assignment_id", "agent_id", "session_id", "occurred_at", "payload"]),
  ArtifactManifest: objectSchema(["schema_version", "execution_id", "base_commit", "head_commit", "tree_id", "changed_files", "name_status", "patch_path", "created_at"]),
  VerificationEvidence: objectSchema(["schema_version", "evidence_id", "execution_id", "scope_passed", "changed_files", "out_of_scope_files", "gates", "created_at"]),
  ReviewRequest: objectSchema(["schema_version", "review_id", "execution_id", "assignment_id", "worker_agent_id", "worker_session_id", "reviewer_agent_id", "evidence_id", "created_at", "expires_at"]),
  ReviewVerdict: objectSchema(["schema_version", "event_id", "review_id", "execution_id", "reviewer_agent_id", "reviewer_session_id", "verdict", "comments", "evidence_refs", "occurred_at"]),
  ExecutionSummary: objectSchema(["schema_version", "execution_id", "assignment_id", "worker_agent_id", "worker_session_id", "state", "updated_at"]),
  GuardFinding: objectSchema(["schema_version", "finding_id", "severity", "category", "message", "status", "created_at"]),
} as const;

function objectSchema(required: string[]) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: true,
    required,
    properties: { schema_version: { const: SCHEMA_VERSION } },
  } as const;
}

export function assertVersionedObject(value: unknown, required: string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const row = value as Record<string, unknown>;
  if (row.schema_version !== SCHEMA_VERSION) {
    throw new Error(`${label} has unsupported schema_version`);
  }
  for (const key of required) {
    if (!(key in row)) throw new Error(`${label} missing ${key}`);
  }
}

export function parseReviewVerdict(value: unknown): ReviewVerdict {
  assertVersionedObject(
    value,
    ["event_id", "review_id", "execution_id", "reviewer_agent_id", "reviewer_session_id", "verdict", "comments", "evidence_refs", "occurred_at"],
    "review verdict",
  );
  if (!["approve", "request_changes", "reject"].includes(String(value.verdict))) {
    throw new Error("review verdict has invalid verdict");
  }
  if (!Array.isArray(value.evidence_refs)) throw new Error("review verdict evidence_refs must be an array");
  return value as ReviewVerdict;
}

export function parseExecutionEvent(value: unknown): ExecutionEvent {
  assertVersionedObject(value, ["event_id", "event_type", "execution_id", "assignment_id", "agent_id", "session_id", "occurred_at", "payload"], "execution event");
  if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) throw new Error("execution event payload must be an object");
  if (!Number.isFinite(Date.parse(String(value.occurred_at)))) throw new Error("execution event occurred_at must be an ISO timestamp");
  return value as ExecutionEvent;
}
