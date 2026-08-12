export const SCHEMA_VERSION = "1.0" as const;

export type GuardMode = "report" | "warn" | "enforce";
export type ExecutionState =
  | "queued"
  | "preparing"
  | "running"
  | "verifying"
  | "awaiting_review"
  | "accepted"
  | "changes_requested"
  | "rejected"
  | "failed"
  | "cancelled";

export type AgentProfile = {
  schema_version: typeof SCHEMA_VERSION;
  agent_id: string;
  display_name: string;
  adapter_type: string;
  capabilities: string[];
  status: "available" | "busy" | "offline";
  created_at: string;
  updated_at: string;
};

export type AgentSession = {
  schema_version: typeof SCHEMA_VERSION;
  session_id: string;
  agent_id: string;
  issued_at: string;
  expires_at: string;
  status: "active" | "expired" | "revoked";
};

export type GateSpec = {
  name: string;
  command: string;
  required: boolean;
};

export type TaskAssignment = {
  schema_version: typeof SCHEMA_VERSION;
  assignment_id: string;
  task_id: string;
  sprint_id: string | null;
  title: string;
  goal: string;
  dependencies: string[];
  read_scopes: string[];
  write_scopes: string[];
  acceptance_criteria: string[];
  required_capabilities: string[];
  gates: GateSpec[];
  base_commit: string;
  assigned_agent_id: string;
  reviewer_agent_id: string;
  created_at: string;
};

export type ExecutionEvent = {
  schema_version: typeof SCHEMA_VERSION;
  event_id: string;
  event_type: string;
  execution_id: string;
  assignment_id: string;
  agent_id: string;
  session_id: string;
  occurred_at: string;
  payload: Record<string, unknown>;
};

export type ArtifactManifest = {
  schema_version: typeof SCHEMA_VERSION;
  execution_id: string;
  base_commit: string;
  head_commit: string;
  tree_id: string;
  changed_files: string[];
  name_status: string;
  patch_path: string;
  stdout_path?: string;
  stderr_path?: string;
  created_at: string;
};

export type GateResult = {
  name: string;
  command: string;
  required: boolean;
  passed: boolean;
  exit_code: number | null;
  output_path: string;
};

export type VerificationEvidence = {
  schema_version: typeof SCHEMA_VERSION;
  evidence_id: string;
  execution_id: string;
  scope_passed: boolean;
  changed_files: string[];
  out_of_scope_files: string[];
  gates: GateResult[];
  router_report?: Record<string, unknown>;
  created_at: string;
};

export type ReviewRequest = {
  schema_version: typeof SCHEMA_VERSION;
  review_id: string;
  execution_id: string;
  assignment_id: string;
  worker_agent_id: string;
  worker_session_id: string;
  reviewer_agent_id: string;
  evidence_id: string;
  created_at: string;
  expires_at: string;
};

export type ReviewVerdict = {
  schema_version: typeof SCHEMA_VERSION;
  event_id: string;
  review_id: string;
  execution_id: string;
  reviewer_agent_id: string;
  reviewer_session_id: string;
  verdict: "approve" | "request_changes" | "reject";
  comments: string;
  evidence_refs: string[];
  occurred_at: string;
};

export type GuardFinding = {
  schema_version: typeof SCHEMA_VERSION;
  finding_id: string;
  execution_id: string | null;
  severity: "info" | "low" | "medium" | "high" | "critical";
  category: string;
  message: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
};

export type ExecutionSummary = {
  schema_version: typeof SCHEMA_VERSION;
  execution_id: string;
  assignment_id: string;
  worker_agent_id: string;
  worker_session_id: string;
  state: ExecutionState;
  worktree_path: string | null;
  branch_name: string | null;
  pid: number | null;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  failure_code: string | null;
};

export type PlanManifest = {
  project?: string;
  tasks: Array<{
    id: string;
    name?: string;
    title?: string;
    goal?: string;
    depends_on?: string[];
    scope?: string[];
    read_scopes?: string[];
    write_scopes?: string[];
    acceptance_criteria?: string[];
    required_capabilities?: string[];
    gates?: GateSpec[];
    agent_id?: string;
    reviewer_agent_id?: string;
  }>;
};

export type AdapterConfig = {
  mode: "dual-router" | "mock";
  python_executable: string;
  router_path: string;
  planner_model?: string;
  executor_model?: string;
  timeout_ms: number;
  termination_grace_ms: number;
  env_allowlist: string[];
  /** Deterministic CI fixture writes; ignored by the live dual-router adapter. */
  mock_changes?: Record<string, string>;
};

export type AdapterRegistration = {
  schema_version: typeof SCHEMA_VERSION;
  adapter_id: string;
  adapter_type: string;
  display_name: string;
  version: string;
  config_ref: string | null;
  health: "unknown" | "healthy" | "degraded" | "unavailable";
  created_at: string;
  updated_at: string;
};

export type CapabilitySnapshot = {
  schema_version: typeof SCHEMA_VERSION;
  snapshot_id: string;
  adapter_id: string;
  adapter_type: string;
  adapter_version: string;
  capabilities: string[];
  captured_at: string;
  expires_at: string;
  source: "declared" | "probed" | "compatibility";
  fingerprint: string;
};

export const TERMINAL_STATES = new Set<ExecutionState>([
  "accepted",
  "rejected",
  "failed",
  "cancelled",
]);

export const STATE_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  queued: ["preparing", "cancelled", "failed"],
  preparing: ["running", "cancelled", "failed"],
  running: ["verifying", "cancelled", "failed"],
  verifying: ["awaiting_review", "cancelled", "failed"],
  awaiting_review: ["accepted", "changes_requested", "rejected", "cancelled", "failed"],
  changes_requested: ["queued", "cancelled", "failed"],
  accepted: [],
  rejected: [],
  failed: [],
  cancelled: [],
};
