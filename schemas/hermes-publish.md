# Hermes publish contracts (Phase 2)

Authoritative shapes for pending/approved drafts and Jekyll posts. Live drafts under gitignored `.autoclaw/hermes/`; staged posts under committed `site/_posts/`.

## Pending / approved draft

Path: `.autoclaw/hermes/pending/<id>.md` → after approve → `.autoclaw/hermes/approved/<id>.md`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Same as filename stem; prefer `YYYY-MM-DD-<slug>` |
| `profile` | `blog` \| `research` \| `thread` \| `report` | Hermes profile that authored the draft |
| `title` | string | Post title |
| `date` | date | `YYYY-MM-DD` |
| `slug` | string | kebab-case; used in Jekyll filename |
| `tags` | string[] | optional |
| `approved` | bool | false in pending; true in approved |
| `approved_at` | string \| omit | ISO-8601 UTC set by `/hermes approve` |

## Jekyll post (`site/_posts/YYYY-MM-DD-slug.md`)

| Field | Type | Notes |
|---|---|---|
| `layout` | string | `post` |
| `title` | string | quoted title |
| `date` | datetime | `YYYY-MM-DD 00:00:00 +0000` |
| `categories` | string[] | includes Hermes `profile` |
| `tags` | string[] | optional |
| `hermes_id` | string | stable link back to approved id |

## Approval equivalence

| Signal | Effect |
|---|---|
| `/hermes approve <id>` | Sets `approved: true`, writes `approved/<id>.md`, removes pending |
| Frontmatter `approved: true` then approve/status | Same end state — command is source of move |

GitHub PR review is **not** a content-approval signal; it gates merge/deploy of already-approved staged posts on branch `content`.

## Config additions (`.autoclaw/hermes/config.yaml`)

```yaml
pages:
  site_dir: site
  content_branch: content
  posts_dir: site/_posts
```
