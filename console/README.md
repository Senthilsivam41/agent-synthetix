# Orchestrate Control Console

Vite + React UI for the AutoClaw soft-gate flow. Spec: [`docs/ux/orchestrate-console.md`](../docs/ux/orchestrate-console.md).

## Run

```bash
cd console
npm install
npm run dev
```

Open http://localhost:5173 — Vite plugin serves `/api/orchestrator/*` against repo `.autoclaw/orchestrator/`.

## Slash-command bridge

UI buttons enqueue lines to `.autoclaw/orchestrator/commands/pending.jsonl`. Host agent drains them by running the matching `/orchestrate …` command (see `.agent/rules/orchestrate.md`).

## Status

- [x] Scaffold + tokens + FS API
- [x] Intake screen (upload / index / enqueue)
- [x] Clarify / Plan / Approve / Sprints screens
- [x] Filesystem-driven refresh and pending/processed command activity
- [x] Strict generated JSON Schema validation

## Verification

```bash
npm run generate:schemas
npm run hermes:compat -- --executable hermes
npm run hermes:runtime -- show --workspace ..
npm test
npm run build
npm run smoke:dual-router:live
npm run smoke:hermes:live
```

H0 provides a read-only Hermes compatibility check and an isolated runtime manifest with prepare/activate/rollback operations. H1 registers worker adapters and stores time-bounded capability snapshots in control-plane database migration 2. H2 adds an immutable Hermes completion contract, a local stdio JSON-RPC fixture adapter, and kernel proofs that in-scope fixture work reaches `awaiting_review`/`accepted` while out-of-scope writes fail. Mock remains the default worker path; Hermes Agent stays disabled until a pinned 0.20 runtime passes live review (`hermes_enabled` is unset in default config). Live Hermes smoke is `npm run smoke:hermes:live` and no-ops unless `HERMES_LIVE_SMOKE=1` and the executable is the pinned 0.20.0 release. Phase 5 GitHub Issues sync runs during `plan` when `.autoclaw/orchestrator/github-issues.yaml` is enabled.

The dual-router live smoke command runs in a temporary Git repository when `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is available. Otherwise it exits successfully with an explicit `skipped` result. The Hermes live smoke command skips unless `HERMES_LIVE_SMOKE=1` and the executable is the pinned 0.20.0 runtime.
