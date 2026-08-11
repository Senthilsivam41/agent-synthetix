import { useCallback, useEffect, useState } from "react";
import { api, type CommandActivity as Activity } from "../lib/api";

type Props = { refreshKey: number; onPendingCount: (count: number) => void };

export function CommandActivity({ refreshKey, onPendingCount }: Props) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const load = useCallback(async () => {
    try {
      const value = await api.commandActivity();
      setActivity(value); onPendingCount(value.pending.items.length); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [onPendingCount]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  async function copy(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopyStatus("Command copied.");
    } catch {
      setCopyStatus("Copy failed. Select the command text manually.");
    }
  }

  return (
    <details className="command-activity">
      <summary>Command activity {activity ? `(${activity.pending.items.length} pending)` : ""}</summary>
      <p className="sr-only" aria-live="polite">{copyStatus}</p>
      {error && <p role="alert" className="error-text">{error}</p>}
      {!activity && !error && <p className="muted" aria-busy="true">Loading commands…</p>}
      {activity && <div className="command-columns">
        <section aria-labelledby="pending-commands"><h2 id="pending-commands">Pending</h2>
          {activity.pending.items.length === 0 ? <p className="muted">No commands waiting.</p> : <ul className="command-list">{activity.pending.items.map((item, index) => <li key={item.id ?? index}><code>{item.command ?? "Unknown command"}</code>{item.command && <button type="button" className="btn btn-quiet" onClick={() => void copy(item.command!)}>Copy</button>}</li>)}</ul>}
        </section>
        <section aria-labelledby="processed-commands"><h2 id="processed-commands">Processed</h2>
          {activity.processed.items.length === 0 ? <p className="muted">No processed commands yet.</p> : <ul className="command-list">{activity.processed.items.slice(-10).reverse().map((item, index) => <li key={item.id ?? index}><span><code>{item.command ?? "Unknown command"}</code><small>{item.status ?? "processed"}</small></span></li>)}</ul>}
        </section>
      </div>}
    </details>
  );
}
