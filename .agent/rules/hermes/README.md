> Hermes profiles are host-agnostic instruction sets for research, blogging, threads, and reports. Trigger on "/hermes", "ResearchHermes", "run research memo", or "hermes research".

# Hermes — Profile Index

Hermes profiles live under `.agent/rules/hermes/<profile>/`. The host agent loads `profile.md` for that profile; sibling files (`prompt.md`, `tone.yaml`, examples) are referenced by relative path.

| Profile | Path | Purpose |
|---|---|---|
| Research | [`research/profile.md`](./research/profile.md) | Cadence research memos + semantic diff vs prior day |
| Blog | [`blog/profile.md`](./blog/profile.md) | Long-form posts from research diffs (Phase 3 — ready) |
| Thread | [`thread/profile.md`](./thread/profile.md) | Platform-aware short threads (Phase 6) |
| Report | [`report/profile.md`](./report/profile.md) | Executive reports with semantic change summary (Phase 6) |
| Gate | [`gate.md`](./gate.md) | Phase 2 approve / preview / publish / queue |

## Architecture layers

Hermes = **instruction set** (this directory). Workers today = **local host agent**. State today = **local `.autoclaw/`** (vector, KG, MEMORY.md, hermes memos). OpenClaw = later **hosted runner** with Postgres migration — profiles do not change.

See [docs/architecture-plan-phases.md](../../../docs/architecture-plan-phases.md) and [docs/hermes-vs-openclaw-layers.svg](../../../docs/hermes-vs-openclaw-layers.svg).

## Slash commands

| Command | Profile | Status |
|---|---|---|
| `/hermes init` | (runtime) | Phase 0 — done |
| `/hermes research [topic]` | research | Phase 1 — ready |
| `/hermes preview <id>` | gate | Phase 2 — ready |
| `/hermes approve <id>` | gate | Phase 2 — ready |
| `/hermes publish <id>` | gate | Phase 2 — ready |
| `/hermes queue <source>` | gate | Phase 2 — ready |
| `/hermes blog …` | blog | Phase 3 — ready |

## On-disk runtime (gitignored)

```
.autoclaw/hermes/
  config.yaml
  research/
    memos/YYYY-MM-DD/<slug>.md
    sources.json
  pending/          # approval inbox
  approved/         # after /hermes approve
  preview/          # HTML from /hermes preview
```

Committed publish tree: `site/_posts/` (Jekyll). Deploy branch: `content`.
