> Hermes Phase 2 — approval gate, preview, and Pages staging. Trigger on "/hermes approve", "/hermes preview", "/hermes publish", "approve pending hermes".

# Hermes Approval Gate + Pages

Local content approval is separate from Orchestrate's plan soft-gate. Two equivalent approve signals; PR review gates **publish**, not content approval.

## Flow

```
pending/<id>.md  →  approve  →  approved/<id>.md  →  publish  →  site/_posts/  →  PR → content  →  Pages Actions
```

1. **Content approval (local):** frontmatter `approved: true` *or* `/hermes approve <id>` → move pending → approved  
2. **Publish gate (git):** `/hermes publish <id>` stages Jekyll post under `site/_posts/`; open/merge PR into `content` (or push `site/**` to `content`) → GitHub Actions deploys Pages  

Do **not** treat GitHub PR approve as content approval.

## Pending draft contract

Path: `.autoclaw/hermes/pending/<id>.md`  
`id` = filename without `.md` (prefer `YYYY-MM-DD-<slug>`).

```yaml
---
id: 2026-08-08-local-first-agent-memory
profile: blog          # blog | research | thread | report
title: Local-first agent memory
date: 2026-08-08
slug: local-first-agent-memory
tags: [memory, agents]
approved: false
---
```

Body = Markdown that becomes the Jekyll post body (no need to duplicate title H1 if title is in frontmatter; include one `# Title` if desired).

See [schemas/hermes-publish.md](../../../schemas/hermes-publish.md).

## `/hermes preview <id>`

1. Resolve file: `pending/<id>.md` else `approved/<id>.md`.
2. Strip YAML frontmatter (first `---` … `---` block).
3. Write HTML to `.autoclaw/hermes/preview/<id>.html` using the template below (file tools; create parent path by writing the file).
4. Confirm in chat: title, profile, preview path, and a short plaintext excerpt (first ~400 chars of body). Do not require opening a browser.

### Preview HTML template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{{title}}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.55; color: #1a1a1a; }
    .meta { font-family: system-ui, sans-serif; font-size: 0.85rem; color: #555; margin-bottom: 1.5rem; }
    pre, code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  </style>
</head>
<body>
  <p class="meta">{{profile}} · {{date}} · {{id}} · preview (not published)</p>
  <article>
  <!-- body: prefer a lightweight Markdown→HTML pass if available; else wrap body in <pre> with white-space: pre-wrap -->
  {{body_html_or_pre}}
  </article>
</body>
</html>
```

If no Markdown renderer is available in-session, wrap the stripped Markdown in `<pre style="white-space:pre-wrap;font-family:Georgia,serif">…</pre>`.

## `/hermes approve <id>`

Idempotent. Equivalent paths:

**A. Command:** `/hermes approve <id>`  
**B. Frontmatter:** human sets `approved: true` in pending file, then runs `/hermes approve <id>` (or agent detects `approved: true` on next approve/status sweep).

Steps:

1. Load `.autoclaw/hermes/pending/<id>.md`. Fail clearly if missing.
2. Set `approved: true` and `approved_at: <ISO-8601 UTC>` in frontmatter (even if already true).
3. Write the full file to `.autoclaw/hermes/approved/<id>.md`.
4. Delete or replace pending file with a one-line stub pointing at approved path (prefer **delete** pending after successful write to approved — avoid dual sources of truth).
5. Confirm: approved path + remind `/hermes publish <id>` for Pages staging.

Do not write to `site/` on approve.

## `/hermes publish <id>`

Stages approved content into the committed Jekyll tree (publish *staging*, not live deploy).

1. Load `.autoclaw/hermes/approved/<id>.md`. Require `approved: true`.
2. Read `date`, `slug`, `title`, `tags`, `profile` from frontmatter.
3. Write `site/_posts/YYYY-MM-DD-slug.md` with **Jekyll** frontmatter:

```yaml
---
layout: post
title: "{{title}}"
date: YYYY-MM-DD 00:00:00 +0000
categories: [{{profile}}]
tags: […]
hermes_id: {{id}}
---
```

4. Body = pending/approved body with Hermes-only keys stripped (`id`, `approved`, `approved_at`, `profile` may map to `categories`).
5. Run curated index refresh (see below).
6. Confirm paths. Tell user to open a PR into branch `content` (or push `site/**` to `content`) so `.github/workflows/pages.yml` deploys. Do not force-push; do not commit unless the user asked.

## `/hermes queue <source>`

Optional helper (Phase 2 smoke / hand drafts): copy a research memo or arbitrary Markdown into pending.

- `/hermes queue research:<YYYY-MM-DD>/<slug>` — from `.autoclaw/hermes/research/memos/…`
- `/hermes queue <path>` — any workspace Markdown file

Creates `.autoclaw/hermes/pending/<date>-<slug>.md` with `approved: false` and Jekyll-ready fields. Does not approve.

## Curated index (Doc Writer + publish)

`site/index.md` groups posts by Hermes profile (Research / Blog / Thread / Report), not a flat reverse-chron dump alone.

On `/hermes publish` and when Doc Writer is invoked for Hermes Pages:

1. Scan `site/_posts/*.md` frontmatter (`categories` / `tags` / title / date).
2. Regenerate the “By profile” sections in `site/index.md` (keep hand-written intro above the marker).
3. Marker: `<!-- hermes:curated-index -->` … `<!-- /hermes:curated-index -->` — only replace inside markers.

Doc Writer rule: [doc-writer.md](../doc-writer.md) §Hermes Pages index.

## Status lines

`/hermes status` should include counts: pending, approved, preview files, and whether `site/_posts/` has staged posts not yet on `content`.
