# Hermes Pages (Jekyll)

Committed static site for approved Hermes content.

| Path | Role |
|---|---|
| `_config.yml` | Jekyll config |
| `_posts/` | Dated posts (`YYYY-MM-DD-slug.md`) staged by `/hermes publish` |
| `index.md` | Curated index by profile (Doc Writer maintains marker block) |
| `_layouts/` | Minimal default + post layouts |

## Deploy

- Workflow: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
- Branch: `content` (pushes that touch `site/**`)
- Source directory: `./site`

Enable **GitHub Pages → GitHub Actions** in repo settings before the first deploy.

## Local preview (optional)

```bash
cd site && bundle exec jekyll serve
```

Requires a local Jekyll install; CI uses `actions/jekyll-build-pages`.
