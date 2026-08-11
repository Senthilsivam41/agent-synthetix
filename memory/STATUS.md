# Current status

**Updated:** 2026-08-11
**Branch:** `codex/hermes-agent-architecture-adrs`
**Last slice:** Proposed Hermes Agent integration architecture, ADRs, and implementation plan (documentation only)

## Product shape

- Core runtime = host agent + `.agent/rules/*.md` + gitignored `.autoclaw/`
- Soft-gate flow documented in README / architecture; executable in `.agent/rules/orchestrate.md`
- Optional UI: Vite console under `console/`
- Hermes content profiles: `.agent/rules/hermes.md` + `.agent/rules/hermes/<profile>/`

## Hermes (architecture plan Phases 0–4 and 6)

| Piece | Status |
|---|---|
| Directory-per-profile scaffold | Done |
| ResearchHermes + semantic/lexical diff | Done |
| Gate: preview / approve / publish / queue | Done |
| Jekyll `site/` + Pages Actions (`content`) | Done |
| BlogHermes (`/hermes blog` → pending from memo diff) | Done |
| `/learn` multi-tool adapters + normalized provenance | Done (Phase 4) |
| Thread / Report generators | Done (Phase 6) |
| Live Pages deploy | Live: https://senthilsivam41.github.io/agent-synthetix/ (run `31512674632`, commit `895d9f6`) |
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
- Proposed adapter expansion: Hermes Agent as a governed worker behind the kernel boundary; see `docs/proposals/hermes-agent-integration-architecture.md` and ADRs 0002–0005
- Proposal status does not change shipped capabilities: the Hermes Agent adapter, event ingress, A2A edge, and profile promotion are not implemented

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
| WCAG 2.2 AA implementation pass | Done; Axe/keyboard/token tests pass, manual screen-reader and browser-zoom checks remain |

### Run console

```bash
cd console && npm install && npm run dev
# http://localhost:5173
```

## Known gaps

1. Execute the live dual-router smoke when a supported model credential is explicitly available
2. Add browser-level interaction coverage for the guided console workflow
3. Complete manual VoiceOver/NVDA, zoom, and high-contrast console verification
4. Hermes Phase 5 GitHub Issues synchronization
5. `.autoclaw/` is local runtime (gitignored) — do not commit

## Try Hermes Phases 1–4 and 6

In agent chat (not terminal):

1. `/hermes init`
2. `/hermes research local-first agent memory`
3. `/hermes blog <date>/<slug>` (or `--memo <path>`)
4. `/hermes thread <source> --platform x` or `/hermes report <source>`
5. `/hermes preview <id>` → `/hermes approve <id>` → `/hermes publish <id>`
6. Push approved `site/**` to `content`; Pages deploys through Actions
