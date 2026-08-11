> BlogHermes — long-form posts from ResearchHermes diffs. Trigger on "/hermes blog", "BlogHermes".

# BlogHermes

## Status

**Phase 3 — ready.** Writes pending drafts only. Gate + Pages = Phase 2 ([gate.md](../gate.md)).

## Role

Consume a **ResearchHermes memo** (prefer one with a `## Diff vs …` section). Turn what changed into a public technical post. Output lands in `.autoclaw/hermes/pending/` for approve → publish. Never write `site/` or approve yourself.

## Operating rules

1. File tools only for `.autoclaw/hermes/**`. Forward slashes.
2. Idempotent: same `date`+`slug` overwrites pending draft in place.
3. Primary input = research memo path. Do **not** re-research from scratch unless memo missing and user passed `--allow-raw`.
4. Prefer Diff section as spine of the post. Baseline memos (`baseline: true` / no Diff) OK — frame as first look, not change log.
5. Tone from [`tone.yaml`](./tone.yaml): `technical / first_person / standard / public`. Interpolate into [`prompt.md`](./prompt.md).
6. Stop at pending. Confirm ≤5 lines: pending path, source memo, next `/hermes preview|approve`.

## Invocation

- `/hermes blog` — latest memo under default topics / most recent memo day (ask if ambiguous)
- `/hermes blog <slug>` — latest memo for slug across dates
- `/hermes blog <YYYY-MM-DD>/<slug>` — exact memo
- `/hermes blog --memo <path>` — explicit `.autoclaw/hermes/research/memos/…` path
- Optional: `--date YYYY-MM-DD` (post date, default today UTC), `--title "…"`, `--tags a,b`

## On invoke

1. Resolve memo:
   - Path under `.autoclaw/hermes/research/memos/YYYY-MM-DD/<slug>.md`
   - Fail clearly if missing (suggest `/hermes research <topic>` first)
2. Read memo frontmatter + body. Extract:
   - `slug`, `title`, `date`, `sources`, `baseline`, `diff_mode`, `prior_date`
   - `## Diff vs …` bullets (`[NEW]` / `[CHANGED]` / `[REMOVED]`)
   - `## Summary` / `## Findings` as supporting context
3. Assemble prompt from `prompt.md` + `tone.yaml`.
4. Write pending draft (contract below).
5. Confirm paths.

## Pending output contract

Path: `.autoclaw/hermes/pending/<id>.md`  
`id` = `{post_date}-{slug}` (post date may differ from memo date).

```yaml
---
id: 2026-08-09-local-first-agent-memory
profile: blog
title: What changed in local-first agent memory
date: 2026-08-09
slug: local-first-agent-memory
tags: [memory, agents, research-diff]
approved: false
source_memo: .autoclaw/hermes/research/memos/2026-08-07/local-first-agent-memory.md
source_memo_date: 2026-08-07
prior_date: 2026-08-06
baseline_source: false
---
```

Body = public post Markdown. Must be Jekyll-ready once published (Phase 2 maps these fields → `site/_posts/`).

### Body shape (required sections)

1. Optional `# {{title}}` (or rely on frontmatter title at publish)
2. Short lede (1–3 sentences) — why this change set matters
3. `## What changed` — rewrite Diff bullets into prose (keep NEW/CHANGED/REMOVED meaning; drop raw tag noise if voice suffers)
4. `## Why it matters` — implications for builders
5. `## Sources` — cite memo sources (normalized URLs)

Length: `standard` verbosity — roughly 400–900 words unless Diff tiny (then shorter OK).

## Diff → prose rules

| Memo marker | Blog treatment |
|---|---|
| `[NEW]` | Lead with discovery / addition |
| `[CHANGED]` | Contrast prior vs now (use "(was: …)" when present) |
| `[REMOVED]` | Call out deprecation / drop explicitly |
| no Diff / baseline | Section titled `## First look` instead of `## What changed` |

Do not invent facts absent from memo Summary/Findings/Diff/Sources.

## Sibling files

- [`prompt.md`](./prompt.md) — template
- [`tone.yaml`](./tone.yaml) — knobs
- [`examples/`](./examples/) — few-shot pending sample
