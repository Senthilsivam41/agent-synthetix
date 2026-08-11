# Future changes

**Updated:** 2026-08-11
Prioritized backlog for Orchestrate console + soft-gate productization. Control-plane sequence: [Product Roadmap](../docs/product-roadmap.md). Hermes content sequence: [Architecture plan phases](../docs/architecture-plan-phases.md).

## P0 — Product foundation

- [x] Decide and document execution authority for operational state transitions
- [x] Define verified completion and add representative collision fixtures
- [x] Add canonical agent, assignment, event, evidence, review, finding, and outcome contracts
- [x] Establish initial contract/conformance tests and state-freshness rules
- [x] Implement the dual-router subprocess adapter and mock vertical slice
- [x] Add deterministic contract guarding before dynamic coalitions
- [ ] Run the live dual-router smoke test when credentials are explicitly available
- [x] Add a credential-gated live dual-router smoke harness using a temporary repository
- [x] Expand the minimal schema representation into generated, strict JSON Schema validation

## P1 — Console screens

1. [x] **Clarify** — load/save `plans/clarifications.md`; queue `/orchestrate ask`; answer form (max 1–5 Qs)
2. [x] **Plan Review** — render `plans/project-plan.md`; queue `/orchestrate propose` / `revise`
3. [x] **Approve** — consequence panel; queue `/orchestrate approve`; reflect `approved` → `manifested`
4. [x] **Sprints** — list `sprints/sprint-*.yaml`; soft-gate banner; revive enqueue

## P2 — Console platform

- [x] Watch `.autoclaw/` so board refreshes without reload
- [x] Command outbox UI: show pending/processed queue; “copy slash-cmd” helper
- [x] Markdown renderer for plan body (safe subset)
- [x] YAML parse for status + sprint rows (already depend on `yaml` package)
- A11y pass per `docs/ux/orchestrate-console.md` (focus, reduced motion, dropzone picker)
- Light theme tokens (`data-theme="light"`)

## P3 — Agent / contract

- Keep `.agent/rules/orchestrate.md` and `~/.claude/skills/orchestrate` in sync when rules change
- Optional: small runner that drains `pending.jsonl` without human paste
- Ensure `init` always creates `intake/` `plans/` `commands/` stubs

## P4 — Hermes content (architecture plan)

- [x] Phase 0 — directory profiles + tone/platforms
- [x] Phase 1 — ResearchHermes + semantic/lexical diff + sources.json
- [x] Phase 2 — `/hermes approve` + preview + Jekyll `site/` + Pages workflow
- [x] Phase 3 — BlogHermes from research diffs → pending
- [ ] First live Pages deploy — enable Actions source + merge `site/**` to `content`
- [ ] Phase 4 — `/learn` multi-tool paths
- [ ] Phase 5 — Linear/GitHub Issues → manifest sync
- [ ] Phase 6 — ThreadHermes + ReportHermes
- [ ] Phase 7 — OpenClaw hosted runner + Postgres migration for vector/KG

## P5 — Broader AutoClaw (out of console MVP)

- Ops dashboard (metrics, KG, inboxes, KDream) — separate from Orchestrate console
- Bounded coalitions — only after deterministic guard validation
- Controlled profile evolution — only after sufficient task-family evidence
- Hard budgets before any internal bidding/economy experiment

## Process (always)

After each major implementation slice:

1. Update [STATUS.md](./STATUS.md) and this file
2. Re-index with Codegraph (`codegraph init` once; then refresh/reindex per tool docs)
3. Prefer `codegraph_explore` for file/symbol lookup — avoid full-repo Grep/Glob sweeps when index exists
