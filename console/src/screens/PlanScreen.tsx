import { useCallback, useEffect, useState } from "react";
import { PlanDocument } from "../components/PlanDocument";
import { api, type PlanResponse } from "../lib/api";

type Props = { refreshKey: number; onToast: (message: string) => void; onApprove: () => void };

export function PlanScreen({ refreshKey, onToast, onApprove }: Props) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => api.plan().then(setPlan).catch((reason: Error) => setError(reason.message)), []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  async function draft() {
    setBusy(true); setError("");
    try { await api.draftPlan(); onToast("Queued /orchestrate propose"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function revise() {
    if (!feedback.trim()) { setError("Describe what should change before requesting a revision."); return; }
    setBusy(true); setError("");
    try { await api.revisePlan(feedback); setFeedback(""); onToast("Queued /orchestrate revise"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  return <section className="workflow-screen plan-review">
    {error && <p role="alert" className="error-text">{error}</p>}
    {!plan && !error && <p className="muted" aria-busy="true">Loading project plan…</p>}
    {plan && !plan.exists && <div className="empty-state"><h2>No project plan yet</h2><p>Queue a draft after intake and clarifications are ready.</p><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void draft()}>Draft plan</button></div>}
    {plan?.exists && <>
      <header className="plan-heading"><div><p className="eyebrow">Plan review · v{plan.version}</p><h2>{plan.title}</h2><p>{plan.goal || "Review the full plan before approval."}</p></div><span className="status-label">{plan.workflow_status}</span></header>
      {plan.scope_warnings.length > 0 && <div className="banner banner-warning" role="alert"><strong>Approval blocked</strong><ul>{plan.scope_warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
      <div className="revision-panel"><label htmlFor="revision-feedback">Request changes</label><textarea id="revision-feedback" rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Describe the specific correction or missing constraint."/><button type="button" className="btn" disabled={busy || !feedback.trim()} onClick={() => void revise()}>Queue revision</button></div>
      <PlanDocument text={plan.text} />
      <div className="actions"><button type="button" className="btn btn-primary" disabled={!plan.can_approve} onClick={onApprove}>Continue to approve</button></div>
    </>}
  </section>;
}
