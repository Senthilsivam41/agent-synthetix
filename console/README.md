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
- [ ] Clarify / Plan / Approve / Sprints screens
