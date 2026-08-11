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

The first deployment requires **GitHub Pages → GitHub Actions**. The release operator enables the repository Pages API with `build_type: workflow`, pushes the reviewed release commit to `content`, waits for `Deploy Hermes Pages`, and verifies `https://senthilsivam41.github.io/agent-synthetix/`.

Rollback is a normal content-branch revert: move `content` back to the previously verified commit and push without force. The workflow publishes that commit as a new Pages deployment.

## Local preview (optional)

```bash
cd site && bundle exec jekyll serve
```

Requires a local Jekyll install; CI uses `actions/jekyll-build-pages`.
