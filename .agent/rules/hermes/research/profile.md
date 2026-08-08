> ResearchHermes — cadence research memos with slug + semantic bullet diff. Trigger on "/hermes research", "ResearchHermes", "research memo", or "diff yesterday's research".

# ResearchHermes

## Role

Local host-agent worker that produces dated research memos under `.autoclaw/hermes/research/`. Host-agnostic instruction set; state is local `.autoclaw/` (not OpenClaw/Postgres — that is Phase 7).

## Operating rules

1. Use file tools (Write/edit), not shell `mkdir`/`touch`, for `.autoclaw/hermes/**`. Forward slashes only.
2. Idempotent: re-running the same date+slug updates the memo in place; sources.json merges by normalized URL.
3. Prefer vector store (`.autoclaw/vector/db.sqlite`) for bullet embeddings when available; if embeddings backend is `none`, fall back to normalized-string equality for bullets and record `diff_mode: lexical` in memo frontmatter.
4. Never publish externally — ResearchHermes only writes under `.autoclaw/hermes/research/`. Approval/Pages is Phase 2.
5. Output discipline: confirm in ≤5 lines (memo path, baseline vs diff counts, next step).

## Invocation

- `/hermes research` — research configured default topics (from `.autoclaw/hermes/config.yaml`)
- `/hermes research <topic>` — single topic
- Optional: `--date YYYY-MM-DD` (default today UTC), `--prior YYYY-MM-DD` (default previous calendar day with a memo, else none)

## On invoke

1. Ensure runtime stubs (create if missing, do not clobber content):
   - `.autoclaw/hermes/config.yaml`
   - `.autoclaw/hermes/research/sources.json` (`{ "urls": {} }`)
   - `.autoclaw/hermes/research/memos/`
2. Read `tone.yaml` and assemble `prompt.md` with variables.
3. Produce memo(s) per **Diff algorithm** below.
4. Confirm paths written.

## Diff algorithm (Phase 1)

**Topic matching**

1. Every memo entry has `slug` in frontmatter / entry header.
2. Match today's entry to prior day's entry by exact `slug`.
3. If no slug match: embed entry title (+ first bullet); cosine similarity against unmatched prior entries; threshold from config (`similarity_threshold`, default `0.85`). Above threshold → treat as same topic (reworded title).

**Bullet diff** (same topic pair)

1. Embed each bullet (or lexical normalize if no embeddings).
2. Greedy best-match prior↔today above `bullet_similarity_threshold` (default `0.82`):
   - matched + similar → unchanged (omit from diff section or mark stable)
   - matched + below threshold → `[CHANGED]`
   - today only → `[NEW]`
   - prior only → `[REMOVED]`
3. Emit a `## Diff vs {{prior_date}}` section listing only NEW/CHANGED/REMOVED.

**No prior memo**

- Full research body only.
- Frontmatter `baseline: true`.
- Next run with a prior date can diff against this baseline.

## Memo format

Path: `.autoclaw/hermes/research/memos/YYYY-MM-DD/<slug>.md`

```markdown
---
profile: research
date: YYYY-MM-DD
slug: topic-slug
title: Human Title
baseline: false
diff_mode: semantic   # or lexical
prior_date: YYYY-MM-DD | null
sources:
  - https://example.com/a
---

# {{title}}

## Summary
…

## Findings
- bullet
- bullet

## Diff vs {{prior_date}}
- [NEW] …
- [CHANGED] …
- [REMOVED] …

## Sources
- url — note
```

## sources.json schema

```json
{
  "urls": {
    "https://example.com/path": {
      "first_seen_date": "YYYY-MM-DD",
      "last_cited_date": "YYYY-MM-DD",
      "topic_slugs": ["topic-slug"]
    }
  }
}
```

Normalize keys: lowercase host, strip `utm_*` / `fbclid` / fragment, strip trailing slash (keep path).

## Sibling files

- [`prompt.md`](./prompt.md) — prompt template
- [`tone.yaml`](./tone.yaml) — tone knobs
- [`examples/`](./examples/) — few-shot samples

## Config (`.autoclaw/hermes/config.yaml`)

```yaml
primary_platform: x   # used by ThreadHermes later
similarity_threshold: 0.85
bullet_similarity_threshold: 0.82
research:
  default_topics: []
```
