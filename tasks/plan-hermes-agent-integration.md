# Implementation plan: governed Hermes Agent integration

## Overview

Introduce Hermes Agent as a third worker path behind a common adapter boundary, prove it locally in an isolated worktree, then add evidence/telemetry surfaces. A2A and controlled learning remain separately gated expansions. This plan does not change ADR 0001: SQLite and the kernel remain authoritative, and acceptance still requires deterministic evidence plus independent review.

## Architecture decisions

- Hermes Agent is a worker, not an orchestration authority ([ADR 0002](../docs/adr/0002-hermes-agent-as-governed-worker.md)).
- Local stdio JSON-RPC is the first transport; HTTP and A2A are later ([ADR 0003](../docs/adr/0003-hermes-transport-and-runtime-isolation.md)).
- External events and citations are reported evidence, never self-certification ([ADR 0004](../docs/adr/0004-hermes-events-evidence-and-acceptance.md)).
- Learning output becomes a proposal, never an active mutation ([ADR 0005](../docs/adr/0005-hermes-learning-as-profile-proposals.md)).

## Dependency graph

```text
H0 compatibility baseline
        ↓
H1 common WorkerAdapter contract
        ↓
H2 local Hermes adapter vertical slice
        ↓
H3 event and citation evidence
        ↓
H4 console/operator surfaces
        ↓
H5 optional A2A pilot
        ↓
H6 controlled profile proposals
```

H3 citation-contract work may begin after the H1 contracts stabilize, but event ingestion depends on H2 run correlation. H5 and H6 must not begin until the local vertical slice is accepted.

## Phase H0 — Compatibility and rollback baseline

### Task H0.1: Record the installed and target runtimes

**Description:** Add a read-only compatibility command and fixture that records installed Hermes version, target version, runtime dependencies, enabled transport features, and capability discovery output without printing secrets.

**Acceptance criteria:**

- [ ] Output distinguishes missing, incompatible, supported, and untested runtimes.
- [ ] Target is pinned to a reviewed release rather than floating `latest`.
- [ ] Capability data contains retrieval time and content fingerprint.

**Verification:**

- [ ] Unit tests cover missing binary, malformed version, v0.17, and target v0.20 fixtures.
- [ ] Manual check confirms no credential values are printed.

**Dependencies:** None  
**Files likely touched:** adapter compatibility module, contracts, focused tests  
**Estimated scope:** Medium

### Task H0.2: Establish isolated upgrade and rollback procedure

**Description:** Document and script a non-destructive target-version installation in a separate Hermes profile/runtime, preserving the current v0.17 installation until conformance passes.

**Acceptance criteria:**

- [ ] Existing Hermes state is backed up or left untouched.
- [ ] New runtime is independently addressable and version-pinned.
- [ ] Rollback returns adapter configuration to the previous runtime without database mutation.

**Verification:**

- [ ] Dry-run or fixture test proves path resolution.
- [ ] Manual rollback rehearsal is recorded before live enablement.

**Dependencies:** H0.1  
**Files likely touched:** operations documentation, adapter config schema, scripts/tests  
**Estimated scope:** Medium

### Checkpoint H0

- [ ] Upgrade procedure and rollback are reviewed.
- [ ] No production/default adapter points at the new runtime.
- [ ] `npm test` and `npm run build` pass.

## Phase H1 — Common worker contract

### Task H1.1: Introduce `WorkerAdapter`

**Description:** Refactor mock and dual-router execution behind a typed lifecycle interface supporting capability discovery, start, events, approval, cancellation, and collection.

**Acceptance criteria:**

- [ ] Mock and dual-router implement the same interface.
- [ ] Kernel behavior and terminal-state semantics are unchanged.
- [ ] Adapter result and failure categories remain explicit and versioned.

**Verification:**

- [ ] Existing adapter and kernel integration tests remain green.
- [ ] Contract tests run against both existing adapters.

**Dependencies:** H0.1  
**Files likely touched:** `adapter.ts`, adapter modules, contracts, tests  
**Estimated scope:** Medium

### Task H1.2: Add adapter registrations and capability snapshots

**Description:** Add numbered SQLite migrations and strict schemas for adapter identity, configuration reference, version, health, and time-bounded capability snapshots.

**Acceptance criteria:**

- [ ] Registrations never persist raw credentials.
- [ ] Assignment activation checks required capabilities against a current snapshot.
- [ ] Unknown or stale capabilities fail closed or require explicit operator override in a future design.

**Verification:**

- [ ] Migration, replay, stale-snapshot, and schema-version tests pass.
- [ ] Repeated registration is idempotent.

**Dependencies:** H1.1  
**Files likely touched:** store migrations, contracts/schema generator, kernel, tests  
**Estimated scope:** Medium

### Checkpoint H1

- [ ] Mock and dual-router complete their existing vertical slices unchanged.
- [ ] Schema generation and strict validation pass.
- [ ] Architecture/API documentation reflects the adapter registry.

## Phase H2 — Local Hermes vertical slice

### Task H2.1: Implement completion-contract translation

**Description:** Convert `TaskAssignment` into an immutable Hermes run request containing outcome, verification, constraints, boundaries, stop conditions, worktree path, and correlation IDs.

**Acceptance criteria:**

- [ ] Every required gate and write scope is represented without downgrade.
- [ ] The adapter cannot add repository-wide scope.
- [ ] The normalized request is persisted as provenance.

**Verification:**

- [ ] Snapshot tests cover normal, ambiguous, broad-scope, and no-gate assignments.
- [ ] Mutation tests prove a worker response cannot alter the stored assignment.

**Dependencies:** H1.1  
**Files likely touched:** Hermes contract mapper, contracts/schema, tests  
**Estimated scope:** Small

### Task H2.2: Implement local JSON-RPC transport

**Description:** Launch the pinned Hermes gateway over stdio from the execution worktree, handle lifecycle/events/approvals, and support interrupt then forced termination.

**Acceptance criteria:**

- [ ] Process working directory is exactly the assigned worktree.
- [ ] PID, version, external run/session IDs, timing, and termination reason are recorded.
- [ ] Secrets use an allowlist and are redacted from diagnostics.

**Verification:**

- [ ] Fixture server tests cover success, malformed RPC, timeout, cancellation, approval expiry, and process crash.
- [ ] Secret-canary test finds no leaked value in arguments or artifacts.

**Dependencies:** H0.2, H1.2, H2.1  
**Files likely touched:** Hermes adapter/transport, configuration, tests  
**Estimated scope:** Medium

### Task H2.3: Prove the governed execution path

**Description:** Run Hermes through assignment, worktree execution, Git evidence, gates, review request, independent verdict, and acceptance.

**Acceptance criteria:**

- [ ] In-scope task reaches `awaiting_review`, then `accepted` only after independent approval.
- [ ] Out-of-scope task fails despite Hermes reporting completion.
- [ ] Cancellation and process failure preserve partial evidence.

**Verification:**

- [ ] Mock conformance runs in CI.
- [ ] Live smoke is credential-gated and runs only when explicitly enabled.
- [ ] Restart/reconcile test preserves external-run correlation.

**Dependencies:** H2.2  
**Files likely touched:** kernel adapter integration, fixtures, integration tests, smoke script  
**Estimated scope:** Medium

### Checkpoint H2 — Architecture acceptance gate

- [ ] ADR 0002 and ADR 0003 acceptance conditions are demonstrated.
- [ ] Existing collision demo remains reproducible.
- [ ] Human reviews evidence before Hermes becomes an enabled adapter.

## Phase H3 — Events, citations, and trust

### Task H3.1: Add raw delivery and normalized event contracts

**Description:** Store external event deliveries idempotently, authenticate envelopes, and normalize supported Hermes messages into reported execution events.

**Acceptance criteria:**

- [ ] Duplicate, replayed, stale, malformed, and unknown-session events cannot advance state.
- [ ] Raw and normalized records retain correlation without storing secrets.
- [ ] Out-of-order events create findings when they imply illegal transitions.

**Verification:**

- [ ] HMAC, nonce, timestamp, ordering, replay, and retry tests pass.
- [ ] Restart reconciliation produces no duplicate events.

**Dependencies:** H1.2, H2.2  
**Files likely touched:** migrations, event ingress/normalizer, schemas, tests  
**Estimated scope:** Medium

### Task H3.2: Add citation evidence

**Description:** Add versioned claim/source/hash contracts and make ResearchHermes and ReportHermes able to attach grounded citation evidence.

**Acceptance criteria:**

- [ ] Citations preserve retrieval time, source URL, claim ID, and content hash.
- [ ] Unsupported/unavailable verification remains visible.
- [ ] Citation claims cannot satisfy execution gates unless a configured verifier accepts them.

**Verification:**

- [ ] Contract tests cover supported, contradicted, unavailable, changed-page, and duplicate citations.
- [ ] Research/Report fixture outputs remain approval-gated.

**Dependencies:** H1.1; may run in parallel with H2 after contracts stabilize  
**Files likely touched:** contracts/schema, Hermes content rules, verifier, tests  
**Estimated scope:** Medium

### Checkpoint H3

- [ ] ADR 0004 acceptance conditions are demonstrated.
- [ ] Event and citation evidence is visible through headless status/API.
- [ ] Security review covers HMAC, replay, redaction, and source-content handling.

## Phase H4 — Operator surfaces

### Task H4.1: Extend execution APIs and console

**Description:** Display adapter/version, external run health, reported events, approval prompts, citation status, and findings without conflating worker completion with kernel acceptance.

**Acceptance criteria:**

- [ ] UI labels reported, verified, reviewed, and accepted states distinctly.
- [ ] Cancel and approval actions are correlated and auditable.
- [ ] Existing console accessibility baseline remains green.

**Verification:**

- [ ] API contract tests and component accessibility tests pass.
- [ ] Keyboard-only run/cancel/approval flow is verified.

**Dependencies:** H2.3, H3.1  
**Files likely touched:** API adapter, API client/types, execution screen/components, tests  
**Estimated scope:** Medium

### Checkpoint H4 — Developer-preview candidate

- [ ] Full mock and live-gated conformance suites pass.
- [ ] `npm test`, `npm run build`, and security audit pass.
- [ ] Docs distinguish Content Hermes from Hermes Agent.
- [ ] No public claim exceeds demonstrated evidence.

## Phase H5 — Optional A2A pilot

### Task H5.1: Add an A2A edge adapter

**Description:** Map discovery and messages to registered workers while keeping canonical assignments, leases, worktrees, and acceptance in the kernel.

**Acceptance criteria:**

- [ ] A2A peers cannot create assignments or acquire scopes.
- [ ] Delegated identities remain correlated to the parent execution.
- [ ] Unsupported capabilities fail closed.

**Verification:**

- [ ] Interoperability fixtures and malicious-peer tests pass.
- [ ] Disconnect/retry does not duplicate work.

**Dependencies:** H4 checkpoint and explicit approval to begin A2A  
**Files likely touched:** A2A adapter, contracts, registry integration, tests  
**Estimated scope:** Medium

## Phase H6 — Controlled profile proposals

### Task H6.1: Import learning as proposals

**Description:** Normalize Hermes `/learn` and Curator output into deduplicated `ProfileProposal` records that cannot affect active behavior.

**Acceptance criteria:**

- [ ] Source provenance and runtime version are mandatory.
- [ ] Equivalent proposal content deduplicates.
- [ ] Active profile pointers cannot be changed by import.

**Verification:**

- [ ] Schema, permission, deduplication, and attempted-direct-mutation tests pass.

**Dependencies:** H4 checkpoint and controlled-evolution contract approval  
**Files likely touched:** proposal contracts/migrations, importer, tests  
**Estimated scope:** Medium

### Task H6.2: Add evaluation, canary, promotion, and rollback

**Description:** Evaluate proposals against stable task-family benchmarks, canary them, require independent promotion approval, and retain reversible versions.

**Acceptance criteria:**

- [ ] Promotion requires verified improvement without safety regression.
- [ ] Rejected/canary-failed proposals remain auditable.
- [ ] Rollback restores the prior active version atomically.

**Verification:**

- [ ] Deterministic evaluation fixtures, regression blocking, approval independence, and rollback tests pass.

**Dependencies:** H6.1 and sufficient accepted benchmark data  
**Files likely touched:** evaluation service, profile store, kernel transitions, tests  
**Estimated scope:** Medium

### Checkpoint H6

- [ ] ADR 0005 acceptance conditions are demonstrated.
- [ ] Governed-evolution claims remain disabled until repeated canaries pass.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Second orchestration authority | High | Kernel-only transitions; Hermes-managed planning/worktrees disabled for governed runs |
| Target release changes rapidly | High | Pin release; capability snapshot; conformance before upgrade |
| Nested delegation obscures identity | High | Parent execution envelope and delegation event chain |
| Event forgery/replay | High | Authentication, nonce, freshness, idempotent delivery table |
| Secrets in model/tool logs | High | Allowlist, redaction, canary tests, bounded raw retention |
| HTTP/A2A expands attack surface | High | Local stdio first; separate approval gates for later transports |
| Citation page changes | Medium | Retrieval time, content hash, independent re-check status |
| UI conflates worker and accepted state | Medium | Explicit state labels and accessibility tests |
| Self-improvement degrades behavior | High | Proposal-only import, stable evaluation, canary, approval, rollback |

## Open decisions before implementation

- Exact pinned Hermes v0.20 patch/tag after the H0 security and compatibility review.
- Whether the first live adapter uses a dedicated Hermes profile or a fully isolated `HERMES_HOME`.
- Raw external-event retention duration and maximum payload size.
- Which citation claims require deterministic re-fetch versus independent human review.
- Minimum accepted-task volume per task family before H6 may start.

## Definition of done

- Every task has focused automated verification.
- Existing mock, dual-router, collision, review, console, and schema suites remain green.
- Live credentials are optional and never required for CI.
- Runtime evidence survives restart and supports replay.
- Project memory and CodeGraph are refreshed after each accepted phase.
- ADR status changes only after its acceptance conditions are demonstrated.
