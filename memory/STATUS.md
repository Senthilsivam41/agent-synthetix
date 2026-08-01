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
| Shared control-plane kernel | Done — SQLite WAL, migrations, events/projections, legacy import |
| Collision enforcement | Done — canonical scopes, transactional leases, isolated Git worktrees, post-run diff guard |
| Evidence and review | Done — gates, artifact provenance, file-bus request, independent verdict |
| Dual-router adapter | Done — local Python shim + subprocess lifecycle; mock conformance passes; live smoke pending credentials |
| Headless command | Done — init/plan/run/ingest/reconcile/status/cancel/cleanup plus registration/session helpers |
| FS/API plugin (`plugins/orchestratorFsApi.ts`) | Done — v1 kernel API plus preserved compatibility endpoints |
| Command enqueue API | Done |
| Shell + step rail | Done |
| **Intake** screen | Done (upload / index / enqueue) |
| Clarify / Plan / Approve | Placeholders (intentionally outside this tranche) |
| Sprints | Done — assignments, dependencies/scopes, leases/worktrees, timeline, reviews, findings |
| Codegraph index | Done (2026-08-01) — `.codegraph/` local; use `codegraph sync` after edits |

### Run console

```bash
cd console && npm install && npm run dev
# http://localhost:5173
```

## Known gaps

1. Clarify, Plan, and Approve console screens are not built
2. Live dual-router smoke is pending explicitly available credentials
3. Guard schema validation is intentionally minimal and should graduate to generated full JSON Schema validation before developer preview
4. Runtime KDream state and `MEMORY.md` have not been initialized
5. `.autoclaw/` is local runtime (gitignored) — do not commit

## Verification snapshot

- `npm test` passes the contract, store, scope, collision, out-of-scope, and independent-review suites
- `npm run build` succeeds on Node 22.22.3 (built-in SQLite emits its documented experimental warning)
- Kernel-managed acceptance was exercised end to end with the mock adapter
