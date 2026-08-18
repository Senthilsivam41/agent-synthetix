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
```

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
