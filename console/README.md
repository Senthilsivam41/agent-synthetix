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
```

H0 provides a read-only Hermes compatibility check and an isolated runtime manifest with prepare/activate/rollback operations. H1 registers worker adapters and stores time-bounded capability snapshots in control-plane database migration 2. Mock and dual-router remain the enabled worker paths; Hermes Agent remains disabled until the H2 worktree conformance slice passes. Phase 5 GitHub Issues sync runs during `plan` when `.autoclaw/orchestrator/github-issues.yaml` is enabled.

The live smoke command runs in a temporary Git repository when `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is available. Otherwise it exits successfully with an explicit `skipped` result.
