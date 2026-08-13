# GitHub Issues sync (Phase 5)

Authoritative contract for issue → manifest create-only pull and status write-back. GitHub Issues is the **sole** task source adapter (no Linear, no `TaskSource` interface).

Live state under gitignored `.autoclaw/orchestrator/`. Manifest YAML is the create-only merge target; issue bodies are never rewritten.

## Config (`.autoclaw/orchestrator/github-issues.yaml`)

```yaml
schema_version: "1.0"
enabled: true
owner: null          # infer from `gh repo view` when null
repo: null
state: open          # pull only this issue state
limit: 100
```

Missing file → kernel skips sync. Compatibility `/orchestrate plan` creates the stub on init and pulls when `enabled: true`. Unavailable `gh` / auth is reported, never fabricated as zero issues.

## Issue → task (create-only)

Stable id: `gh-<number>`. Match existing tasks by `id` **or** `github_issue`. If a match exists, leave name, scopes, and `depends_on` unchanged.

| Manifest field | Source |
|---|---|
| `id` | `gh-<number>` |
| `name` / `title` | issue title |
| `goal` | first non-empty body paragraph, else title |
| `github_issue` | issue number |
| `github_url` | issue HTML URL |
| `source` | `github_issue` |
| `write_scopes` / `scope` | YAML frontmatter `write_scopes` or `scope`, else labels `scope:<glob>` |
| `depends_on` | frontmatter `depends_on`, else `depends on #N` in the body (`gh-N`) |
| `agent_id` / `reviewer_agent_id` | optional frontmatter; omitted when absent |

Issues without a parseable write scope are **not** added to the manifest. They are listed in `.autoclaw/orchestrator/issues/skipped.yaml` with `reason: missing_scope`.

## Write-back (status only)

| Event | GitHub action | Not allowed |
|---|---|---|
| Sprint assignment | Append issue comment (marker `orchestrate:assign`) | Body rewrite; assignment labels |
| Task accepted / done | Append comment (marker `orchestrate:done`) then **close** the issue | Silent close; body rewrite |

Idempotency: skip when `.autoclaw/orchestrator/issues/writeback.jsonl` already has the same `fingerprint`. Comments include an HTML marker so re-runs are safe.

Cadence: every `/orchestrate plan` (and kernel `plan`). Not a KDream tick.

Prefer a gitignored merge target (`.autoclaw/orchestrator/manifests/`). Updating a tracked manifest dirties the primary worktree and kernel `run` will refuse to start until the tree is clean.
