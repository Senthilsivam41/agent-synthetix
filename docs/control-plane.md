# Local control plane

The kernel-managed path is the product's collision and evidence authority. The older slash-command path remains useful for planning and compatibility, but its direct file mutations are advisory.

## Requirements

- Node.js 22.13 or newer
- Git
- A clean primary worktree before `run`
- Python and a local dual-router checkout only for live dual-router mode

## Headless workflow

From `console/`:

```bash
npm install
npm run control-plane -- init --workspace ..
npm run control-plane -- register-agent --workspace .. --id worker --name Worker --capabilities typescript
npm run control-plane -- register-agent --workspace .. --id reviewer --name Reviewer
npm run control-plane -- create-session --workspace .. --agent worker
npm run control-plane -- create-session --workspace .. --agent reviewer
npm run control-plane -- plan --workspace .. --manifest path/to/manifest.yaml
npm run control-plane -- run --workspace .. --assignment <assignment-id>
npm run control-plane -- ingest --workspace ..
npm run control-plane -- status --workspace ..
npm run control-plane -- get-lease-status --workspace .. --scopes src/**,docs/**
npm run control-plane -- get-task-state --workspace .. --tasks task-a,task-b
```

`get-lease-status` and `get-task-state` are read-only advisory queries (`api_version: "1.0"`). They do not initialize the database, take write leases, or record commands. A successful body has `ok: true` and `safe_to_proceed: true`, which means the snapshot is authoritative — not that a scope is free. Lease safety is `conflict_risk === "none"`. Every failure uses the same envelope and `safe_to_proceed: false`:

| Code | When |
|---|---|
| `KERNEL_UNREACHABLE` | `control-plane.db` is missing or cannot be opened |
| `LOCK_HELD_TIMEOUT` | Another control-plane writer holds `control-plane.lock` through the read timeout |
| `SCHEMA_VERSION_MISMATCH` | `api_version` is present and is not `"1.0"` |
| `MALFORMED_REQUEST` | Body is not a valid `LeaseStatusQuery` or `TaskStateQuery` |

`conflict_risk` is `none | exact | ancestor | descendant | partial` from the shared scope classifier. `getTaskState` reports the latest execution state, or the assignment status when execution has not started. `evidence_gated` is true only when that execution has a verification evidence row. The same reads are `POST /api/orchestrator/v1/leases/status` and `POST /api/orchestrator/v1/tasks/state`.

## Advisory edge log

Runtime `depends_on` edges are stored in `.autoclaw/orchestrator/depgraph.db`. This is advisory-plane storage. It does not take `control-plane.lock`, does not write `control-plane.db`, and does not participate in collision prevention or evidence-gated completion. A successful response means the edge-log operation finished. It does not mean the edge was admitted by the cycle validator (that check is not implemented yet) and it does not mean dependents were notified.

```bash
npm run control-plane -- edge-claim --workspace .. --actor worker --task task-a
npm run control-plane -- edge-add --workspace .. --actor worker --from task-a --to task-b
npm run control-plane -- edge-remove --workspace .. --actor worker --from task-a --to task-b
npm run control-plane -- edge-dependents --workspace .. --task task-b
```

`actor` is the authenticated identity for this single-instance log. `edge-add` stores `added_by` as `actor` unless `--added-by` is set. The write is rejected with `OWNERSHIP_REJECTED` unless `added_by` is `actor` and `actor` owns `from_task`. Ownership is the `task_owners` row created by `edge-claim`; the first claim wins and is not reassigned. Adds are idempotent while the edge is live (`INSERT OR IGNORE`). Remove sets `removed_at` and leaves the row in place. A later add inserts a new row. `edge-dependents` returns live edges whose `to_task` is the queried task.

The HTTP routes are `POST /api/orchestrator/v1/edges/claim`, `POST /api/orchestrator/v1/edges`, `POST /api/orchestrator/v1/edges/remove`, and `POST /api/orchestrator/v1/edges/dependents`. Failures use `safe_to_proceed: false`:

| Code | When |
|---|---|
| `EDGE_LOG_UNAVAILABLE` | `depgraph.db` cannot be opened or is a newer schema |
| `SCHEMA_VERSION_MISMATCH` | `api_version` is present and is not `"1.0"` |
| `MALFORMED_REQUEST` | Body is not a valid edge-log request |
| `OWNERSHIP_REJECTED` | `added_by` or `actor` is not the owner of `from_task` |

`plan` pulls open GitHub Issues create-only when `.autoclaw/orchestrator/github-issues.yaml` exists and `enabled: true`. Missing file skips sync so CI and kernel tests never invoke `gh`. Accepted verdicts comment and close linked issues; issue bodies are never rewritten. Contract: [schemas/github-issues-sync.md](../schemas/github-issues-sync.md).

The default adapter is `mock`, so initialization is safe for CI. To use the live dual-router adapter, edit the gitignored `.autoclaw/orchestrator/control-plane.config.json`, set `mode` to `dual-router`, and configure the Python executable, local router path, models, timeout, grace period, and environment-variable allowlist. Secrets are inherited only through that allowlist and never placed in arguments.

Hermes Agent (`mode: "hermes"`) is registered as `unavailable` and requires an explicit `hermes_enabled: true` plus a pinned 0.20 executable. Default init does not enable it. H2 CI uses a stdio JSON-RPC fixture spawned from the execution worktree; live smoke is `npm run smoke:hermes:live` and skips unless `HERMES_LIVE_SMOKE=1` and compatibility status is `supported` at 0.20.0.

Run `npm run smoke:dual-router:live` for the credential-gated live dual-router acceptance proof. It uses a temporary clean Git repository, deterministic gates, and an independent reviewer session. If neither supported credential is present, it reports `skipped` without printing secret values.

## Contracts and console refresh

`npm run generate:schemas` deterministically generates `console/schemas/control-plane.schema.json` from the TypeScript contracts. Ajv enforces the generated Draft 2020-12 definitions at external event, verdict, manifest, and adapter-configuration boundaries; unknown properties fail validation.

The Vite console watches relevant `.autoclaw/orchestrator/` files and publishes coalesced invalidations over `/api/orchestrator/events`. The browser then refetches authoritative API views. The event stream is an invalidation channel, not a second state store. Clarify, Plan Review, Approve, Sprints, and pending/processed command activity are available in the console.

## Review file bus

Review requests are written to `.autoclaw/orchestrator/comms/inboxes/<reviewer-agent-id>/`. A reviewer returns a schema-versioned `*.verdict.json` file in its inbox. `ingest` validates the review ID, evidence reference, expiry, reviewer identity, and reviewer session before changing execution state.

## Runtime artifacts

| Path | Role |
|---|---|
| `control-plane.db` | Authoritative SQLite WAL state |
| `control-plane.config.json` | Local adapter configuration |
| `events/YYYY-MM-DD/*.json` | Immutable event exports |
| `artifacts/<execution-id>/` | Patch, adapter logs, gate logs, and artifact manifest |
| `comms/inboxes/<agent-id>/` | Review request/verdict transport |
| `plans/status.{json,yaml}` | Compatibility status projections |
| `sprints/*` | Compatibility plan projections |

Ephemeral worktrees default to `<workspace-parent>/.autoclaw-worktrees/<workspace-name>/<execution-id>`. Accepted branches are retained for manual review and merge.

## Guard modes

- `report`: imported legacy state is visible but does not acquire enforcement claims.
- `warn`: reserved for staged migration after findings are understood.
- `enforce`: all new kernel-managed executions fail closed on invalid identity, transition, lease, scope, evidence, or review state.

The console remains localhost-only. Do not expose its Vite server remotely without adding authentication and authorization.
