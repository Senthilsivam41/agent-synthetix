> Hermes — research / blog / thread / report profiles. Trigger on "/hermes", "Hermes".

# Hermes

Host-agnostic instruction set. Profiles live under [`.agent/rules/hermes/`](./hermes/README.md). Runtime state under `.autoclaw/hermes/` (gitignored). Approval + Pages: [hermes/gate.md](./hermes/gate.md).

## Commands

| Command | Phase | Action |
|---|---|---|
| `/hermes init` | 0 | Create `.autoclaw/hermes/{config.yaml,research/{memos,sources.json},pending/,approved/,preview/}` |
| `/hermes research <topic>` | 1 | Run [ResearchHermes](./hermes/research/profile.md) |
| `/hermes preview <id>` | **2** | Render pending/approved draft → `.autoclaw/hermes/preview/<id>.html` |
| `/hermes approve <id>` | **2** | Pending → approved (`approved: true` equivalent) |
| `/hermes publish <id>` | **2** | Approved → `site/_posts/` + refresh curated index |
| `/hermes queue <source>` | **2** | Copy memo/file into pending for the gate |
| `/hermes blog <slug\|date/slug\|--memo path>` | **3** | [BlogHermes](./hermes/blog/profile.md) — memo diff → pending post |
| `/hermes thread …` | 6 | Scaffold only |
| `/hermes report …` | 6 | Scaffold only |
| `/hermes status` | any | Summarize memos / pending / approved / staged posts / config |

Load [hermes/gate.md](./hermes/gate.md) for preview / approve / publish / queue. Load [hermes/blog/profile.md](./hermes/blog/profile.md) for `/hermes blog`.

## Phase 3 pipeline (smoke)

```
/hermes research <topic>
  → memo under research/memos/
/hermes blog <date>/<slug>   # or --memo <path>
  → pending/<post_date>-<slug>.md
/hermes preview <id>
/hermes approve <id>
/hermes publish <id>
  → site/_posts/…  then PR/push to content branch
```

## Init (idempotent)

Write (file tools, not shell):

```
.autoclaw/hermes/config.yaml
.autoclaw/hermes/research/sources.json
.autoclaw/hermes/research/memos/.gitkeep
.autoclaw/hermes/pending/.gitkeep
.autoclaw/hermes/approved/.gitkeep
.autoclaw/hermes/preview/.gitkeep
```

Default `config.yaml`:

```yaml
primary_platform: x
similarity_threshold: 0.85
bullet_similarity_threshold: 0.82
research:
  default_topics: []
pages:
  site_dir: site
  content_branch: content
  posts_dir: site/_posts
```

Default `sources.json`: `{ "urls": {} }`

## Phase 2 checkpoints

1. **Local content approval** — `/hermes approve` or frontmatter `approved: true` (same end state).  
2. **Publish/deploy** — `/hermes publish` stages `site/_posts/`; merge to `content` runs [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml).

PR review is **not** content approval.

## Phase 1 vs later hosting

Same profiles run on **local host agent** today (state in `.autoclaw`). Later an **OpenClaw hosted runner** can execute the same profiles against hosted Postgres — see [architecture plan](../../docs/architecture-plan-phases.md).

## Tooling

Prefer codebase-memory MCP for vector/KG when available. Embeddings power topic match + bullet semantic diff; fall back to lexical as documented in ResearchHermes.
