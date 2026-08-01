# Current status

**Updated:** 2026-08-01  
**Branch:** `feature/improvements`  
**Last commits (approx):** console scaffold + intake rules restore; UX specs under `docs/ux/`

## Product shape

- Core runtime = host agent + `.agent/rules/*.md` + gitignored `.autoclaw/`
- Soft-gate flow documented in README / architecture; executable in `.agent/rules/orchestrate.md`
- Optional UI: Vite console under `console/`

## Orchestrate soft gate (rules)

Present in `.agent/rules/orchestrate.md`:

- Commands: `intake` `ask` `propose` `approve` `revise` (+ existing plan/assign/…)
- Status machine: `collecting` → `clarifying` → `draft` → `awaiting_approval` → `approved` → `manifested`
- Soft gate on `plan` (warn, never hard-block)
- Slash-command queue: `.autoclaw/orchestrator/commands/pending.jsonl` → agent drains → `processed.jsonl`

## UX specs

- `docs/ux/orchestrate-console.md` — IA, 5 screens, a11y, handoff
- `docs/ux/design-tokens.md` — slate/teal, Newsreader + IBM Plex Sans
- Linked from `docs/README.md` and BRAINSTORM §3

## Console (`console/`)

| Piece | Status |
|---|---|
| Vite + React + TS scaffold | Done |
| Design tokens CSS | Done |
| FS API plugin (`plugins/orchestratorFsApi.ts`) | Done — R/W `.autoclaw/orchestrator/` |
| Command enqueue API | Done |
| Shell + step rail | Done |
| **Intake** screen | Done (upload / index / enqueue) |
| Clarify / Plan / Approve / Sprints | Placeholders only |
| Codegraph index | Done (2026-08-01) — `.codegraph/` local; use `codegraph sync` after edits |

### Run console

```bash
cd console && npm install && npm run dev
# http://localhost:5173
```

## Known gaps

1. Remaining console screens not built
2. No `.codegraph/` index (Codegraph MCP cannot query this repo until init)
3. Agent must drain `commands/pending.jsonl` manually / via `/orchestrate …` in chat
4. `.autoclaw/` is local runtime (gitignored) — do not commit

## Verification snapshot

- `npm run build` in `console/` succeeded at scaffold time
- Intake writes files + queues `/orchestrate intake`
