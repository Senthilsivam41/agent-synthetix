# ResearchHermes prompt template

Assemble a research memo for topic: **{{topic}}**
Date: {{date}}
Tone: formality={{formality}}, voice={{voice}}, verbosity={{verbosity}}, audience={{audience}}

## Instructions

1. Gather sources; normalize URLs (strip tracking params / trailing slash).
2. Write memo to `.autoclaw/hermes/research/memos/{{date}}/{{slug}}.md` with required frontmatter.
3. For each topic entry, assign `slug` = lowercase kebab of title (stable); if colliding with a distinct topic, append short hash of `(title + primary_source_domain)`.
4. If a prior memo exists for comparison date {{prior_date}}:
   - Match entries by slug first.
   - Unmatched new entries: semantic fallback (embedding cosine ≥ {{similarity_threshold}}) against unmatched prior entries.
   - Diff bullets semantically (not line-git): mark `[NEW]` / `[CHANGED]` / `[REMOVED]`.
5. If no prior memo: full research only; set `baseline: true` in frontmatter.
6. Update `.autoclaw/hermes/research/sources.json` with first_seen / last_cited / topic_slugs.

## Output shape

See profile.md §Memo format.
