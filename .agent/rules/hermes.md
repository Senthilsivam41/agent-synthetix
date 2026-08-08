> Hermes — research / blog / thread / report profiles. Trigger on "/hermes", "Hermes".

# Hermes

Host-agnostic instruction set. Profiles live under [`.agent/rules/hermes/`](./hermes/README.md). Runtime state under `.autoclaw/hermes/` (gitignored).

## Commands

| Command | Phase | Action |
|---|---|---|
| `/hermes init` | 0 | Create `.autoclaw/hermes/{config.yaml,research/{memos,sources.json},pending/,published/}` |
| `/hermes research <topic>` | **1** | Run [ResearchHermes](./hermes/research/profile.md) |
| `/hermes blog …` | 3 | Scaffold only until Phase 3 |
| `/hermes thread …` | 6 | Scaffold only |
| `/hermes report …` | 6 | Scaffold only |
| `/hermes approve <id>` | 2 | Pending → published (not yet) |
| `/hermes status` | any | Summarize memos / pending / config |

## Init (idempotent)

Write (file tools, not shell):

```
.autoclaw/hermes/config.yaml
.autoclaw/hermes/research/sources.json
.autoclaw/hermes/research/memos/.gitkeep
.autoclaw/hermes/pending/.gitkeep
.autoclaw/hermes/approved/.gitkeep
```

Default `config.yaml`:

```yaml
primary_platform: x
similarity_threshold: 0.85
bullet_similarity_threshold: 0.82
research:
  default_topics: []
```

Default `sources.json`: `{ "urls": {} }`

## Phase 1 vs later hosting

Same profiles run on **local host agent** today (state in `.autoclaw`). Later an **OpenClaw hosted runner** can execute the same profiles against hosted Postgres — see [architecture plan](../../docs/architecture-plan-phases.md).

## Tooling

Prefer codebase-memory MCP for vector/KG when available. Embeddings power topic match + bullet semantic diff; fall back to lexical as documented in ResearchHermes.
