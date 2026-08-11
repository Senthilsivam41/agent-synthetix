# ADR 0004 — Hermes events, evidence, and acceptance boundary

- Status: Proposed
- Date: 2026-08-11
- Depends on: [ADR 0001](./0001-control-plane-execution-authority.md), [ADR 0002](./0002-hermes-agent-as-governed-worker.md)

## Context

Hermes v0.20 can stream lifecycle and tool events, emit signed outbound webhooks, produce grounded citations, and judge completion against a contract. Those capabilities improve observability and worker discipline, but every signal originates from the worker or its runtime.

Importing `run.completed`, a citation verdict, or a self-verification result directly into an authoritative projection would allow the worker to certify itself. Webhook delivery also introduces signature, replay, ordering, and duplication risks.

## Decision

Use a staged trust model:

1. Authenticate and durably record the external delivery envelope.
2. Validate freshness, replay nonce, external event ID, schema version, adapter identity, execution, agent, and session.
3. Normalize supported payloads into idempotent `ExecutionEvent` records explicitly marked as reported worker telemetry.
4. Persist worker completion contracts, citations, and verification output as evidence artifacts.
5. Independently collect Git/filesystem provenance, check scopes, run required gates, and obtain a different-agent/different-session review before acceptance.

Add a dedicated Hermes ingress endpoint only when HMAC verification and replay storage are implemented. Streaming stdio/HTTP events use the same normalized envelope.

Critical citation evidence includes claim ID, URL, retrieval timestamp, supporting excerpt when allowed, content hash, worker verdict, and optional deterministic re-verification result.

## Alternatives considered

### Treat signed Hermes events as authoritative

- Benefit: simpler projection and faster transitions.
- Rejected: a valid signature proves origin, not correctness, scope compliance, or independent verification.

### Store only normalized events

- Benefit: smaller database and simpler APIs.
- Rejected: loses raw-envelope evidence needed to debug signature, replay, ordering, and schema-normalization failures.

### Trust grounded-citation verdicts without reproduction

- Benefit: immediately improves research quality with little implementation.
- Rejected for critical claims: pages change, sources disappear, and worker/verifier defects remain possible. Preserve hashes and allow deterministic or independent re-checking.

### Poll Hermes state only

- Benefit: no inbound endpoint.
- Rejected as the final model: misses detailed tool/approval evidence and adds latency. Polling remains a recovery path when streams disconnect.

## Consequences

- `run.completed` can advance the kernel only to its existing verification stage.
- Authentication failures, stale/replayed events, unknown sessions, and schema mismatches become findings.
- Raw delivery retention needs size limits and secret redaction.
- Citation verification can be `unavailable` without being silently promoted to `passed`.
- Event ingestion can be retried without duplicate projections.

## Acceptance conditions

1. Duplicate deliveries create one normalized event.
2. Replayed, stale, malformed, or incorrectly signed deliveries cannot advance execution state.
3. Out-of-order events are recorded but cannot create illegal transitions.
4. Hermes completion and citation claims cannot bypass scope, gates, provenance, or independent review.
5. Disconnect and restart tests resume or reconcile events without losing terminal evidence.

## Recovery

Disable inbound delivery and reconcile from the external run API or persisted raw event stream. SQLite remains authoritative; unnormalized deliveries remain inspectable findings.
