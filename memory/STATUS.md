# Current status

**Updated:** 2026-08-01  
**Branch:** `feature/improvements`  
**Last commits (approx):** product roadmap; project memory + Codegraph conventions; console scaffold + intake rules restore

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

## Product strategy

- `docs/product-roadmap.md` — workspace-native agent control-plane positioning
- Accepted hero: “Parallel agent work without parallel-agent collisions.”
- Public one-line summary: “Run every coding agent as one coordinated fleet—without collisions, and with proof.”
- Public competitive copy stays category-level; named comparisons are internal-only
- Primary sequence: execution authority → contracts/telemetry → dual-router adapter → contract guard
- Coalitions, profile evolution, budgets, and an economy remain gated or conditional
- North Star: weekly verified agent tasks completed without human repair

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
2. Agent must drain `commands/pending.jsonl` manually / via `/orchestrate …` in chat
3. No deterministic contract/conformance test harness yet
4. Runtime KDream state and `MEMORY.md` have not been initialized
5. `.autoclaw/` is local runtime (gitignored) — do not commit

## Verification snapshot

- `npm run build` in `console/` succeeded at scaffold time
- Intake writes files + queues `/orchestrate intake`
