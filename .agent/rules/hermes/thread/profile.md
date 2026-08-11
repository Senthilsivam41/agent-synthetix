> ThreadHermes — platform-aware approval-gated short-form drafts. Trigger on "/hermes thread", "ThreadHermes".

# ThreadHermes

## Command

`/hermes thread <source> [--platform x|linkedin|bluesky] [--title "..."] [--tags a,b]`

`source` may be a workspace Markdown file, `research:<YYYY-MM-DD>/<slug>`, `blog:<id>`, or `latest-research`. Resolve it before generation and fail with the attempted paths when missing. Use `--platform` when supplied; otherwise read `primary_platform` from `.autoclaw/hermes/config.yaml`. Reject a platform absent from [`platforms.yaml`](./platforms.yaml).

Read [`tone.yaml`](./tone.yaml), [`platforms.yaml`](./platforms.yaml), and [`prompt.md`](./prompt.md). Never alter those committed profile files at runtime.

## Generation contract

1. Read the source and its citations. Extract one thesis, 3–7 supporting facts, and the intended reader outcome. Do not invent claims, metrics, URLs, or quotations.
2. Apply the platform configuration:
   - `numbered`: produce two or more posts. Include `N/total` in every post and count it toward the limit.
   - `single_post`: produce one post without synthetic thread numbering.
3. Count **Unicode grapheme** clusters, not bytes or UTF-16 code units. Every rendered post, including numbering and URLs, must be at or below `max_chars`.
4. If a post is too long, tighten it once without dropping the thesis or source attribution. If it still exceeds the limit, fail and report the post number and measured count; never truncate blindly.
5. Preserve URLs exactly as provided. Do not assume a shortened URL length.
6. End with a useful conclusion or question, not generic engagement bait.

## Output

Write only `.autoclaw/hermes/pending/<YYYY-MM-DD>-thread-<slug>-<platform>.md` using the [ThreadHermes contract](../../../../schemas/hermes-thread-report.md):

```yaml
---
schema_version: "1.0"
id: 2026-08-11-thread-collision-free-agents-x
profile: thread
title: "Collision-free agent work"
date: 2026-08-11
slug: collision-free-agents-x
tags: [agents]
platform: x
thread_style: numbered
max_chars: 280
source_refs: [research:2026-08-11/collision-free-agents]
approved: false
---
```

For numbered output, use `## Post 1/N` headings followed by the exact post text. For a single post, use `## Post` once. Headings are archive structure and do not count toward the platform limit; the text below each heading does.

Do not post, approve, publish, or write to `site/`. Confirm the draft path, platform, post count, and maximum measured length. The next step is `/hermes preview <id>`.

## Idempotency

If the target exists with the same normalized source hash, platform, and body, report it unchanged. If it differs, require `--replace`; never silently overwrite a pending human-review artifact.
