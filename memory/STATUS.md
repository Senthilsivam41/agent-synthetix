# Current status

**Updated:** 2026-08-08  
**Branch:** `codex/summarise-agentsynthetix-changes`  
**Last slice:** Hermes Phase 0 + Phase 1 (architecture plan)

## Product shape

- Core runtime = host agent + `.agent/rules/*.md` + gitignored `.autoclaw/`
- Soft-gate flow documented in README / architecture; executable in `.agent/rules/orchestrate.md`
- Optional UI: Vite console under `console/`
- Hermes content profiles: `.agent/rules/hermes.md` + `.agent/rules/hermes/<profile>/`

## Hermes (architecture plan Phases 0–1)

| Piece | Status |
|---|---|
| Directory-per-profile scaffold (research/blog/thread/report) | Done |
| ResearchHermes slug + semantic bullet diff algorithm | Done (agent-executable rule) |
| `sources.json` + memo frontmatter contracts | Done — `schemas/hermes-research.md` |
| `/hermes init` / `/hermes research` entry rule | Done — `.agent/rules/hermes.md` |
| Blog / Thread / Report | Scaffold only (later phases) |
| Approval gate + Pages | Not started (Phase 2) |
| OpenClaw hosted runner | Later (Phase 7) — profiles stay local-first |

Layering: Hermes profile (host-agnostic) → local host agent today → `.autoclaw` (vector, KG, MEMORY.md). See `docs/architecture-plan-phases.md` and `docs/hermes-vs-openclaw-layers.svg`.

**Not the same as** product-roadmap “Phase 1” (contracts/telemetry) — that naming is control-plane delivery.

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
- Primary sequence: execution authority → contracts/telemetry → dual-router adapter → contract guard
- North Star: weekly verified agent tasks completed without human repair

## Console (`console/`)

| Piece | Status |
|---|---|
| Vite + React + TS scaffold | Done |
| Kernel + collision + evidence + dual-router mock | Done |
| Intake + Sprints screens | Done |
| Clarify / Plan / Approve | Placeholders |
| Live dual-router smoke | Pending credentials |

### Run console

```bash
cd console && npm install && npm run dev
# http://localhost:5173
```

## Known gaps

1. Clarify, Plan, and Approve console screens are not built
2. Live dual-router smoke pending credentials
3. Guard schema → full JSON Schema validation before developer preview
4. Hermes Phase 2+ (approve, Pages, BlogHermes, …)
5. `.autoclaw/` is local runtime (gitignored) — do not commit

## Try ResearchHermes

In agent chat (not terminal):

1. `/hermes init`
2. `/hermes research local-first agent memory`
3. Inspect `.autoclaw/hermes/research/memos/<date>/<slug>.md`
