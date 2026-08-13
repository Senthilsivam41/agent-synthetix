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

**Decision made:** GitHub Issues is the sole task source. No Linear. No `TaskSource` abstraction.

**Accepted (Phase 5 — [schemas/github-issues-sync.md](./schemas/github-issues-sync.md)):**
- **Pull:** create-only on every `/orchestrate plan` and kernel `plan`. Stable id `gh-<number>`. Match by `id` or `github_issue`; never overwrite name, scopes, or `depends_on`.
- **Skip:** issues without a parseable write scope (frontmatter `write_scopes`/`scope` or label `scope:<glob>`) go to `.autoclaw/orchestrator/issues/skipped.yaml`.
- **Push:** status only. Assignment → issue comment (`orchestrate:assign`). Done/accepted → comment (`orchestrate:done`) then **close**. Never rewrite the issue body. Never assignment labels. Never silent close.
- **Cadence:** planning-time only, not a KDream tick. Missing/`enabled: false` config skips sync. Unavailable `gh` is reported; plan continues.
- **Opt-in for kernel:** missing `.autoclaw/orchestrator/github-issues.yaml` → kernel does not call `gh`. Compatibility `/orchestrate init` creates the stub with `enabled: true`.

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

**Implemented decision (Phase 4):**
- Versioned adapters live in `.agent/rules/intelligence/sources.yaml`; unsupported or unavailable sources fail visibly instead of silently returning no sessions.
- Claude Code, Cursor, Kiro, and Gemini use documented/discovered local stores with read-only access and workspace attribution. Claude Desktop requires an explicit export; application databases are not scraped.
- Kept/discarded classification records source-specific evidence. Ambiguous evidence remains `unknown`; manual `--mark-kept` is explicit, provenance-stamped, and cannot silently upgrade an unrelated session.
- The normalized insight contract, redaction order, fingerprints, watermarks, and idempotency rules are defined in `schemas/learning-insight.md`.

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
3. ~~BlogHermes output format~~ — Phase 3 done (`/hermes blog` → pending)
4. ~~`/learn` multi-tool ingestion (all 5 sources)~~ — Phase 4 done
5. ~~Linear/GitHub Issues manifest sync~~ — Phase 5 done
6. ~~ThreadHermes + ReportHermes~~ — Phase 6 done
7. OpenClaw scale-out
