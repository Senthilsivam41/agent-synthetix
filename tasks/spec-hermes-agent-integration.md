# Specification: governed Hermes Agent integration

- Status: Proposed for implementation review
- Date: 2026-08-11
- Architecture: [Hermes Agent to-be proposal](../docs/proposals/hermes-agent-integration-architecture.md)
- Decisions: [ADR 0002](../docs/adr/0002-hermes-agent-as-governed-worker.md), [ADR 0003](../docs/adr/0003-hermes-transport-and-runtime-isolation.md), [ADR 0004](../docs/adr/0004-hermes-events-evidence-and-acceptance.md), [ADR 0005](../docs/adr/0005-hermes-learning-as-profile-proposals.md)

## Objective

Add Hermes Agent as an optional, governed worker runtime while preserving agent-synthetix as the only execution and acceptance authority.

## Required outcomes

1. The kernel can select mock, dual-router, or Hermes workers through one adapter contract.
2. Hermes runs inside a kernel-created worktree using a pinned, separately managed runtime.
3. Canonical assignments map into Hermes completion contracts without changing scopes, gates, or acceptance criteria.
4. Hermes lifecycle and evidence are recorded with strict identity, version, idempotency, freshness, and provenance checks.
5. A Hermes completion claim cannot bypass diff validation, required gates, artifact collection, or independent review.
6. Grounded citations can support ResearchHermes and ReportHermes through a versioned evidence contract.
7. Hermes learning output remains a non-active proposal until controlled-evolution evaluation and promotion exist.

## Non-functional requirements

- Local-first and loopback/stdio by default.
- No direct Hermes access to the control-plane database.
- No credential values in arguments, stored events, diagnostics, or artifacts.
- Existing mock and dual-router behavior remains compatible.
- Missing or incompatible Hermes installations fail explicitly.
- Every state mutation remains idempotent and transactional.
- The console remains on Node 22.13+; Hermes dependencies remain isolated.

## Definition of done for the first vertical slice

A pinned Hermes runtime receives a canonical assignment, edits only its assigned worktree and scopes, emits normalized lifecycle evidence, passes deterministic gates, receives a verdict from a different agent/session, and reaches `accepted`. A deliberate out-of-scope run with a worker-reported success must reach `failed` with a `scope_violation` finding.

## Deferred scope

- Remote hosted Hermes operation
- A2A-based assignment transport
- Autonomous subagent coalitions
- Active profile promotion
- Automatic merge or deployment
- Budget/economy behavior
