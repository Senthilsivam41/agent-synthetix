# ADR 0001 — Control-plane execution authority

- Status: Accepted and implemented for the research preview
- Date: 2026-08-01

## Context

The rule-driven AutoClaw workflow made coordination portable, but an agent interpreting Markdown cannot also be the sole authority for identity, concurrent scope ownership, evidence completeness, or legal state transitions. Those guarantees must be binary and reproducible across IDEs, CLIs, and model providers.

## Decision

Use a hybrid architecture:

- Host agents own reasoning and implementation.
- The deterministic kernel in `console/plugins/control-plane/` owns registered identities, expiring sessions, assignments, leases, executions, events, evidence, findings, reviews, and state transitions.
- SQLite WAL at `.autoclaw/orchestrator/control-plane.db` is authoritative. JSON, YAML, Markdown, and file-bus messages are imports, exports, or compatibility projections.
- The Vite console API and `npm run control-plane -- …` invoke the same kernel.
- Every kernel-managed execution uses a linked Git worktree and a dedicated branch from the assignment's recorded base commit.
- Direct rule-only writes remain supported as an advisory compatibility mode. They cannot claim kernel-enforced collision prevention or evidence-gated completion.

Only one process may own the workspace writer lock. A second console or headless process fails with the recorded owner and PID rather than creating competing writers.

## Verified completion

An execution is accepted only when all five conditions hold:

1. Execution completed in its assigned worktree.
2. The resulting Git and filesystem changes are entirely within declared write scopes.
3. Every configured required gate passed without being removed or downgraded after execution began.
4. Artifact provenance and verification evidence were persisted.
5. A registered reviewer with a different agent ID and session ID submitted an approving verdict for the current evidence.

Router self-verification is supporting evidence only. Acceptance does not merge the branch; merge remains an explicit later action.

## Consequences

- Node 22.13 or newer is required for built-in `node:sqlite`.
- The primary worktree must be clean before execution.
- Runtime state remains local and gitignored, while immutable accepted events are exported as inspectable JSON.
- Migrated workspaces start in `report` mode and reach `enforce` only after reconciliation succeeds. New workspaces start in `enforce`.
- Coalitions, profile mutation, budgets, bidding, automatic merge, deployment, and hosted authentication remain out of scope.

## Recovery

SQLite transactions append events and update projections together under `BEGIN IMMEDIATE`. Event exports retry from the database outbox. Expired leases fail active executions and preserve evidence. Cleanup uses `git worktree remove` and `git worktree prune`; unresolved worktrees are reported and are never recursively deleted.
