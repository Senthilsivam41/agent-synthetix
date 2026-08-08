# agent-synthetix — Active Design Questions

Decisions made → captured in README.md. These are the **open unknowns** needing answers before implementation.

---

## 1. Hermes Profile Format

**Decision made:** Dedicated profiles (BlogHermes, ThreadHermes, ReportHermes, ResearchHermes).

**Accepted (Phase 0 — see [docs/architecture-plan-phases.md](./docs/architecture-plan-phases.md)):**
- **Directory-per-profile** under `.agent/rules/hermes/<profile>/` with `profile.md` + `prompt.md` + `tone.yaml` + `examples/` (ThreadHermes also has `platforms.yaml`)
- Entry rule: `.agent/rules/hermes.md` (`/hermes init|research|…`)
- Tone via `tone.yaml`: `formality` / `voice` / `verbosity` / `audience`
- ThreadHermes is platform-aware (`x` / `linkedin` / `bluesky`); `--platform` arg, default from `.autoclaw/hermes/config.yaml` `primary_platform`

---

## 2. Research Diff Engine

**Decision made:** Diff mode — compare yesterday's memo vs today, surface `[NEW]`/`[CHANGED]`/`[REMOVED]`.

**Accepted (Phase 1 — executable in [`.agent/rules/hermes/research/profile.md`](./.agent/rules/hermes/research/profile.md)):**
- **Same topic:** slug match first; semantic fallback (embedding cosine ~0.85) for unmatched titles
- **Diff:** bullet-level semantic similarity (reuse vector store); lexical fallback → `diff_mode: lexical`
- **No prior memo:** full research, `baseline: true`
- **Sources:** `.autoclaw/hermes/research/sources.json` keyed by normalized URL
- Contracts: [schemas/hermes-research.md](./schemas/hermes-research.md)

---

## 3. Approval Gate UX

**Decision made:** Human approves before any write to output (docs, PRs, posts).

**Decided for Orchestrate project plans (soft gate):**
- File-drop inputs under `.autoclaw/orchestrator/intake/`
- Flow: `/orchestrate intake` → `ask` → `propose` → review `plans/project-plan.md` → `/orchestrate approve` (generates manifest)
- Hand-set frontmatter `approved: true` is accepted as equivalent on approve
- `/orchestrate plan` does **not** hard-block without an approved plan (smoke tests / hand manifests OK)
- End-user console UX (IA, screens, tokens, a11y, command handoff) is specified under [docs/ux/](./docs/ux/) — design spec only; not a shipped UI runtime

**Accepted (Phase 2 — [`.agent/rules/hermes/gate.md`](./.agent/rules/hermes/gate.md)):**
- **Two approve signals (equivalent):** frontmatter `approved: true` *or* `/hermes approve <id>` → move `pending/` → `approved/`
- **Not** GitHub PR as content approval — PR merge gates **publish/deploy** of already-approved staged posts
- **Preview:** `/hermes preview <id>` → `.autoclaw/hermes/preview/<id>.html` (+ chat excerpt)
- **Stage:** `/hermes publish <id>` → `site/_posts/YYYY-MM-DD-slug.md`
- Contracts: [schemas/hermes-publish.md](./schemas/hermes-publish.md)

---

## 4. Linear / GitHub Issues Sync

**Decision made:** Linear or GitHub Issues as task source, synced to manifest YAML.

**Still open:**
- Linear or GitHub Issues — which is the primary source? Or both?
- Sync direction: read-only pull into manifest, or bidirectional (agent updates issue status)?
- How often does it sync? On every `/orchestrate plan`, or continuous via KDream tick?
- Does the agent write back sprint assignments as issue comments?

---

## 5. GitHub Pages Publishing

**Decision made:** GitHub Pages from this repo.

**Accepted (Phase 2):**
- **SSG:** Jekyll under committed `site/` (`_config.yml`, `_posts/`, curated `index.md`)
- **Deploy:** GitHub Actions [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) on push to branch `content` (paths `site/**`); not AutoBuild cron
- **Posts:** `site/_posts/YYYY-MM-DD-slug.md`
- **Index:** curated by profile (Research / Blog / Thread / Report) via Doc Writer + `/hermes publish` marker block
- Enable **Settings → Pages → GitHub Actions** before first deploy

---

## 6. OpenClaw / Hosted Agent Scale-Out

**Decision made:** Local now, hosted infra later.

**Still open:**
- What's the trigger for moving to hosted? (# of concurrent agents? Cost? Latency?)
- OpenClaw: what is it exactly — an HTTP bridge for agents, or a hosted runner?
- Data migration: local `.autoclaw/` → hosted Postgres. Is this a one-time migration or ongoing sync?
- Which subsystems can stay local vs must move? (Vector store → Postgres; KG → ?; MEMORY.md → ?)

---

## 7. Multi-Tool Session Ingestion (`/learn`)

**Decision made:** Ingest from all 5 tools: Claude Code, Claude Desktop, Kiro, Gemini, Cursor.

**Still open:**
- Each tool stores sessions differently. What are the actual file paths for each on macOS?
- Kiro and Gemini session formats — are they documented?
- How does the kept-vs-discarded signal work for tools other than Claude Code (where git-diff is the kept signal)?

---

## 8. Self-Hosting the Sprint DAG (meta-use-case)

**Decision made:** First concrete project = build agent-synthetix itself using its own sprint DAG.

**Still open:**
- What are the first 5–10 tasks to put in the manifest?
- Which Hermes profile writes the task manifest from the feature list?
- How does the agent that's building the orchestrator avoid modifying its own coordination infrastructure mid-sprint?

---

## Priority Order (suggested)

1. ~~ResearchHermes + diff engine~~ — Phase 1 done
2. ~~Approval gate + publish to GitHub Pages~~ — Phase 2 done
3. BlogHermes output format
4. `/learn` multi-tool ingestion (all 5 sources)
5. Linear/GitHub Issues manifest sync
6. ThreadHermes + ReportHermes
7. OpenClaw scale-out
