# Future changes

**Updated:** 2026-08-01  
Prioritized backlog for Orchestrate console + soft-gate productization.

## P0 — Console screens

1. **Clarify** — load/save `plans/clarifications.md`; queue `/orchestrate ask`; answer form (max 1–5 Qs)
2. **Plan Review** — render `plans/project-plan.md`; queue `/orchestrate propose` / `revise`
3. **Approve** — consequence panel; queue `/orchestrate approve`; reflect `approved` → `manifested`
4. **Sprints** — list `sprints/sprint-*.yaml`; soft-gate banner; revive enqueue

## P1 — Console platform

- Poll/watch `.autoclaw/` so board refreshes without reload
- Command outbox UI: show pending/processed queue; “copy slash-cmd” helper
- Markdown renderer for plan body (safe subset)
- YAML parse for status + sprint rows (already depend on `yaml` package)
- A11y pass per `docs/ux/orchestrate-console.md` (focus, reduced motion, dropzone picker)
- Light theme tokens (`data-theme="light"`)

## P2 — Agent / contract

- Keep `.agent/rules/orchestrate.md` and `~/.claude/skills/orchestrate` in sync when rules change
- Optional: small runner that drains `pending.jsonl` without human paste
- Ensure `init` always creates `intake/` `plans/` `commands/` stubs

## P3 — Broader AutoClaw (out of console MVP)

- Hermes approval UX (BRAINSTORM §3)
- GitHub Pages content site (BRAINSTORM §5)
- Ops dashboard (metrics, KG, inboxes, KDream) — separate from Orchestrate console

## Process (always)

After each major implementation slice:

1. Update [STATUS.md](./STATUS.md) and this file
2. Re-index with Codegraph (`codegraph init` once; then refresh/reindex per tool docs)
3. Prefer `codegraph_explore` for file/symbol lookup — avoid full-repo Grep/Glob sweeps when index exists
