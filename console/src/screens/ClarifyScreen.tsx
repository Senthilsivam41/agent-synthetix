import { useCallback, useEffect, useState } from "react";
import { api, type ClarificationsResponse } from "../lib/api";

type Props = { refreshKey: number; onToast: (message: string) => void; onContinue: () => void };

export function ClarifyScreen({ refreshKey, onToast, onContinue }: Props) {
  const [data, setData] = useState<ClarificationsResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => api.clarifications().then(setData).catch((reason: Error) => setError(reason.message)), []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  async function ask() {
    setBusy(true); setError("");
    try { await api.askClarifications(); onToast("Queued /orchestrate ask"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!data) return;
    const submitted = data.open.map((question) => ({ question, answer: answers[question]?.trim() ?? "" })).filter((item) => item.answer);
    if (!submitted.length) { setError("Answer at least one open question."); return; }
    setBusy(true); setError("");
    try { const updated = await api.saveClarificationAnswers(submitted); setData(updated); setAnswers({}); onToast(`Saved ${submitted.length} answer(s)`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function draft() {
    setBusy(true); setError("");
    try { await api.draftPlan(); onToast("Queued /orchestrate propose"); onContinue(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  return <section className="workflow-screen">
    <header className="screen-heading"><div><h2>Clarify</h2><p className="muted">Resolve the few unknowns that materially change the plan.</p></div><button type="button" className="btn" disabled={busy} onClick={() => void ask()}>Ask critical questions</button></header>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!data && !error && <p className="muted" aria-busy="true">Loading clarifications…</p>}
    {data && <div className="clarify-layout">
      <section aria-labelledby="open-questions"><h3 id="open-questions">Open ({data.open.length})</h3>
        {data.open.length === 0 ? <p className="empty-state">No open questions. Ask the agent for questions or continue to draft the plan.</p> : data.open.map((question, index) => <div className="question-field" key={question}><label htmlFor={`answer-${index}`}>{index + 1}. {question}</label><textarea id={`answer-${index}`} rows={3} value={answers[question] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question]: event.target.value }))} /></div>)}
      </section>
      <section aria-labelledby="answered-questions"><h3 id="answered-questions">Answered ({data.answered.length})</h3>{data.answered.length === 0 ? <p className="muted">No saved answers yet.</p> : <dl className="answer-list">{data.answered.map((item) => <div key={item.question}><dt>{item.question}</dt><dd>{item.answer}</dd></div>)}</dl>}</section>
    </div>}
    <div className="actions"><button type="button" className="btn btn-primary" disabled={busy || !data?.open.length} onClick={() => void save()}>Save answers</button><button type="button" className="btn" disabled={busy} onClick={() => void draft()}>Draft plan</button></div>
  </section>;
}
