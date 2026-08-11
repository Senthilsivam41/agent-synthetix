import { useCallback, useEffect, useState } from "react";
import { api, type PlanResponse } from "../lib/api";

type Props = { refreshKey: number; onToast: (message: string) => void; onRevise: () => void; onComplete: () => void };

export function ApproveScreen({ refreshKey, onToast, onRevise, onComplete }: Props) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => api.plan().then((value) => {
    setPlan(value);
    if (value.workflow_status === "manifested") onComplete();
  }).catch((reason: Error) => setError(reason.message)), [onComplete]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  async function approve() {
    setBusy(true); setError("");
    try { await api.approvePlan(); onToast("Approval queued; waiting for the agent to write the manifest"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  return <section className="workflow-screen approve-screen">
    <header><p className="eyebrow">Explicit approval gate</p><h2>Approve this plan?</h2><p className="muted">This action is deliberate and remains visible in command history.</p></header>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!plan && !error && <p className="muted" aria-busy="true">Loading approval summary…</p>}
    {plan && <div className="approve-panel" aria-describedby="approval-consequences">
      <h3>{plan.title}</h3><p>{plan.task_count} task(s) · {plan.phase_count || "unstructured"} phase(s) · version {plan.version}</p>
      <div id="approval-consequences"><p>Approving will:</p><ul><li>Mark the project plan approved.</li><li>Write a versioned manifest under <code>manifests/</code>.</li><li>Unlock kernel planning and sprint assignment.</li></ul></div>
      {plan.scope_warnings.length > 0 && <div className="banner banner-warning" role="alert">{plan.scope_warnings.join("; ")}</div>}
      {!plan.can_approve && plan.scope_warnings.length === 0 && <div className="banner banner-warning" role="alert">Plan status <strong>{plan.status}</strong> is not ready for approval.</div>}
      <div className="actions"><button type="button" className="btn" onClick={onRevise}>Back to revise</button><button type="button" className="btn btn-primary" aria-describedby="approval-consequences" disabled={busy || !plan.can_approve} onClick={() => void approve()}>{busy ? "Queuing approval…" : "Approve plan"}</button></div>
    </div>}
  </section>;
}
