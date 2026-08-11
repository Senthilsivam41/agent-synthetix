# Current status

**Updated:** 2026-08-11
**Branch:** `codex/summarise-agentsynthetix-changes`  
**Last slice:** Hermes Phase 3 (BlogHermes)

## Product shape

- Core runtime = host agent + `.agent/rules/*.md` + gitignored `.autoclaw/`
- Soft-gate flow documented in README / architecture; executable in `.agent/rules/orchestrate.md`
- Optional UI: Vite console under `console/`
- Hermes content profiles: `.agent/rules/hermes.md` + `.agent/rules/hermes/<profile>/`

## Hermes (architecture plan Phases 0–3)

| Piece | Status |
|---|---|
| Directory-per-profile scaffold | Done |
| ResearchHermes + semantic/lexical diff | Done |
| Gate: preview / approve / publish / queue | Done |
| Jekyll `site/` + Pages Actions (`content`) | Done |
| BlogHermes (`/hermes blog` → pending from memo diff) | Done |
| Thread / Report generators | Scaffold (Phase 6) |
| Live Pages deploy | Needs Settings → Pages → Actions + push `content` |
| OpenClaw hosted runner | Later (Phase 7) |

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
| Clarify / Plan / Approve | Done |
| Pending / processed commands + filesystem refresh | Done |
| Generated strict JSON Schema validation | Done |
| Live dual-router smoke harness | Done; credential-gated run skipped on 2026-08-11 because no supported credential was available |

### Run console

```bash
cd console && npm install && npm run dev
# http://localhost:5173
```

## Known gaps

1. Execute the live dual-router smoke when a supported model credential is explicitly available
2. Add browser-level interaction coverage for the guided console workflow
3. Hermes Phase 4+ (`/learn` paths) / Phase 6 Thread+Report
4. First live Pages deploy (enable Actions + `content` branch)
5. `.autoclaw/` is local runtime (gitignored) — do not commit

## Try Hermes Phase 1–3

In agent chat (not terminal):

1. `/hermes init`
2. `/hermes research local-first agent memory`
3. `/hermes blog <date>/<slug>` (or `--memo <path>`)
4. `/hermes preview <id>` → `/hermes approve <id>` → `/hermes publish <id>`
5. Open PR / push `site/**` to branch `content` for Pages deploy
