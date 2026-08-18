# Agent conventions — memory & Codegraph

Standing rules for any agent working in this repository.

## Memory folder

Path: [`memory/`](./README.md) (committed).

| When | Action |
|---|---|
| Start of substantial work | Read `memory/STATUS.md` + `memory/FUTURE.md` |
| After a milestone / PR-ready slice | Update STATUS (what shipped) and FUTURE (what remains) |
| New standing process | Document here or in STATUS |

Do **not** put secrets or `.autoclaw/` runtime dumps in `memory/`.

## Codegraph (required when available)

1. **Prefer Codegraph for discovery** — use `codegraph_explore` (with `projectPath` = repo root) to find files/symbols/call paths. Do **not** scan the full repo with Grep/Glob/find when `.codegraph/` exists.
2. **Indexing is manual** — the operator runs `codegraph init` / `sync` / `index`. Agents must not run those commands and must not prompt the user to re-index after a slice.
3. **If no index** — MCP will refuse Codegraph for the session; fall back to targeted Read/Grep. Do not treat a missing `.codegraph/` as an open agent task.
4. **Scope** — when an index exists, prefer it for `console/` and `.agent/rules/` after UI or rule changes.

## Related paths

- UX spec: `docs/ux/`
- Console app: `console/`
- Orchestrate rules: `.agent/rules/orchestrate.md`
- Runtime state (gitignored): `.autoclaw/`
