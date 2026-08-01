import { useEffect, useState } from "react";
import { api, type ControlPlaneStatus } from "../lib/api";

export function SprintsScreen() {
  const [status, setStatus] = useState<ControlPlaneStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = () => api.controlPlaneStatus().then((value) => active && setStatus(value)).catch((reason: Error) => active && setError(reason.message));
    void load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (error) return <section><h2>Sprints</h2><p className="banner">Control plane unavailable: {error}</p></section>;
  if (!status) return <section><h2>Sprints</h2><p className="muted">Loading authoritative state…</p></section>;

  const assignment = new Map(status.assignments.map((item) => [item.assignment_id, item]));
  return (
    <section>
      <div className="control-heading">
        <div><h2>Execution control plane</h2><p className="muted">SQLite authority · updated {new Date(status.updated_at).toLocaleTimeString()}</p></div>
        <span className={`guard guard-${status.guard_mode}`}>{status.guard_mode}</span>
      </div>

      <div className="metric-grid">
        <article><strong>{status.assignments.length}</strong><span>Assignments</span></article>
        <article><strong>{status.leases.length}</strong><span>Active leases</span></article>
        <article><strong>{status.reviews.filter((item) => item.status === "pending").length}</strong><span>Pending reviews</span></article>
        <article><strong>{status.findings.length}</strong><span>Open findings</span></article>
      </div>

      <h3>Scope and dependency matrix</h3>
      <div className="table-wrap"><table className="catalog"><thead><tr><th>Task</th><th>Dependencies</th><th>Write scopes</th><th>Status</th></tr></thead><tbody>
        {status.assignments.map((item) => <tr key={item.assignment_id}><td>{item.title}</td><td>{item.dependencies.join(", ") || "—"}</td><td><code>{item.write_scopes.join(", ")}</code></td><td>{item.status}</td></tr>)}
        {!status.assignments.length && <tr><td colSpan={4} className="muted">No kernel-managed assignments yet.</td></tr>}
      </tbody></table></div>

      <h3>Execution timeline</h3>
      <div className="execution-list">
        {status.executions.map((item) => <article key={item.execution_id}>
          <div><strong>{assignment.get(item.assignment_id)?.title ?? item.assignment_id}</strong><span className={`state state-${item.state}`}>{item.state}</span></div>
          <p><code>{item.branch_name ?? "worktree not prepared"}</code></p>
          <small className="muted">{item.worktree_path ?? "No active worktree"} · {new Date(item.updated_at).toLocaleString()}</small>
        </article>)}
        {!status.executions.length && <p className="muted">No executions recorded.</p>}
      </div>

      <div className="control-columns">
        <section><h3>Active leases and worktrees</h3>{status.leases.map((lease) => <p key={lease.lease_id}><code>{lease.scope}</code><br/><small className="muted">execution {lease.execution_id.slice(0, 8)} · expires {new Date(lease.expires_at).toLocaleString()}</small></p>)}{!status.leases.length && <p className="muted">No active leases.</p>}</section>
        <section><h3>Gate and evidence status</h3>{status.evidence.map((evidence) => <article className={`finding ${evidence.scope_passed ? "" : "finding-high"}`} key={evidence.evidence_id}><strong>{evidence.scope_passed ? "Scope verified" : "Scope violation"}</strong><p>{evidence.changed_files.length} changed file(s) · {evidence.gates.map((gate) => `${gate.name}: ${gate.passed ? "pass" : "fail"}`).join(", ") || "no gates"}</p></article>)}{!status.evidence.length && <p className="muted">No verification evidence yet.</p>}</section>
        <section><h3>Findings and stale-state warnings</h3>{status.freshness.stale_execution_ids.length > 0 && <article className="finding"><strong>Stale executions</strong><p>{status.freshness.stale_execution_ids.join(", ")}</p></article>}{status.findings.map((finding) => <article className={`finding finding-${finding.severity}`} key={finding.finding_id}><strong>{finding.category}</strong><p>{finding.message}</p></article>)}{!status.findings.length && !status.freshness.stale_execution_ids.length && <p className="muted">No open findings.</p>}</section>
      </div>
    </section>
  );
}
