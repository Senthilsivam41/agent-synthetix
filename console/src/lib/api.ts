export type IntakeFile = { name: string; type: string };
export type ClarificationAnswer = { question: string; answer: string };
export type ClarificationsResponse = { text: string; open: string[]; answered: ClarificationAnswer[] };
export type PlanResponse = {
  exists: boolean;
  title: string;
  goal: string;
  version: number;
  status: string;
  workflow_status: string;
  scope_warnings: string[];
  can_approve: boolean;
  task_count: number;
  phase_count: number;
  text: string;
};
export type CommandItem = { id?: string; command?: string; status?: string; enqueued_at?: string; processed_at?: string; args?: Record<string, unknown> };
export type CommandActivity = {
  pending: { items: CommandItem[]; malformed: number };
  processed: { items: CommandItem[]; malformed: number };
};
export type ControlPlaneStatus = {
  schema_version: string;
  authoritative_store: string;
  guard_mode: "report" | "warn" | "enforce";
  updated_at: string;
  assignments: Array<{ assignment_id: string; task_id: string; title: string; write_scopes: string[]; dependencies: string[]; status: string }>;
  executions: Array<{ execution_id: string; assignment_id: string; state: string; worktree_path: string | null; branch_name: string | null; updated_at: string }>;
  leases: Array<{ lease_id: string; execution_id: string; scope: string; expires_at: string }>;
  reviews: Array<{ review_id: string; execution_id: string; status: string }>;
  evidence: Array<{ evidence_id: string; execution_id: string; scope_passed: boolean; changed_files: string[]; out_of_scope_files: string[]; gates: Array<{ name: string; passed: boolean; required: boolean }> }>;
  freshness: { latest_event_at: string | null; stale_execution_ids: string[] };
  findings: Array<{ finding_id: string; severity: string; category: string; message: string; created_at: string }>;
};

async function json<T>(resPromise: Promise<Response>): Promise<T> {
  const res = await resPromise;
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  controlPlaneStatus: () => json<ControlPlaneStatus>(fetch("/api/orchestrator/v1/status")),
  status: () =>
    json<{ path: string; text: string }>(fetch("/api/orchestrator/status")),

  intake: () =>
    json<{ files: IntakeFile[]; index: string }>(
      fetch("/api/orchestrator/intake"),
    ),

  clarifications: () => json<ClarificationsResponse>(fetch("/api/orchestrator/clarifications")),
  askClarifications: () => json<{ ok: true }>(fetch("/api/orchestrator/clarifications/ask", { method: "POST" })),
  saveClarificationAnswers: (answers: ClarificationAnswer[]) =>
    json<ClarificationsResponse & { ok: true }>(fetch("/api/orchestrator/clarifications/answers", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }),
    })),
  plan: () => json<PlanResponse>(fetch("/api/orchestrator/plan")),
  draftPlan: () => json<{ ok: true }>(fetch("/api/orchestrator/plan/draft", { method: "POST" })),
  revisePlan: (feedback: string) => json<{ ok: true }>(fetch("/api/orchestrator/plan/revise", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback }),
  })),
  approvePlan: () => json<{ ok: true; plan: PlanResponse }>(fetch("/api/orchestrator/plan/approve", { method: "POST" })),
  commandActivity: () => json<CommandActivity>(fetch("/api/orchestrator/commands/activity")),

  indexIntake: () =>
    json<{ ok: boolean; count: number; index: string }>(
      fetch("/api/orchestrator/intake/index", { method: "POST" }),
    ),

  uploadIntake: async (file: File) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const contentBase64 = btoa(binary);
    return json<{ ok: boolean; name: string }>(
      fetch("/api/orchestrator/intake/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, contentBase64 }),
      }),
    );
  },

  enqueueCommand: (command: string, args: Record<string, unknown> = {}) =>
    json<{ ok: boolean; id: string; queued: string }>(
      fetch("/api/orchestrator/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, args }),
      }),
    ),

  pendingCommands: () =>
    json<{ items: Array<{ id: string; command: string }> }>(
      fetch("/api/orchestrator/commands/pending"),
    ),
};

export function watchRuntime(onChange: (areas: string[]) => void) {
  const source = new EventSource("/api/orchestrator/events");
  source.addEventListener("runtime_changed", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent<string>).data) as { areas?: string[] };
      onChange(payload.areas ?? []);
    } catch { /* malformed invalidations are ignored; the next valid event refreshes state */ }
  });
  return () => source.close();
}
