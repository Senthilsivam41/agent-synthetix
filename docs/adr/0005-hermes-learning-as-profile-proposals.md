# ADR 0005 — Hermes learning as controlled profile proposals

- Status: Proposed
- Date: 2026-08-11
- Depends on: [ADR 0002](./0002-hermes-agent-as-governed-worker.md)
- Roadmap dependency: Controlled profile evolution

## Context

Hermes `/learn`, memory, and Curator capabilities can create or refine reusable skills from sessions, repositories, URLs, and observed workflows. agent-synthetix also has a local `/learn` contract for consent-gated ingestion and a future roadmap phase for governed, reversible profile evolution.

Allowing Hermes to edit active agent profiles or committed rules directly would make behavior changes silent, difficult to attribute, and impossible to compare fairly. It would also turn a worker into its own evaluator and promotion authority.

## Decision

Import Hermes learning output only as a versioned `ProfileProposal`.

A proposal records:

- base profile and proposed version
- source sessions, artifacts, and content fingerprints
- authoring worker and runtime version
- intended task family and claimed benefit
- changed instructions, skills, tools, or model settings
- risk classification and rollback target

Promotion requires:

1. strict contract and security validation;
2. offline evaluation against a stable benchmark set;
3. canary execution using non-overlapping or replayed tasks;
4. comparison against the current profile using verified outcomes;
5. an independent approval decision;
6. immutable promotion event and reversible version pointer.

Until the controlled-evolution phase is implemented, proposals remain advisory files or database rows and cannot affect active routing.

## Alternatives considered

### Allow Curator to update active skills automatically

- Benefit: fastest self-improvement loop.
- Rejected: silent mutation, no accepted baseline, and no independent evidence.

### Disable Hermes learning entirely

- Benefit: simplest safety boundary.
- Rejected: discards potentially valuable candidate generation. Proposal-only import preserves value without granting promotion authority.

### Let a human edit the active profile from the proposal

- Benefit: human gate with little infrastructure.
- Deferred as an emergency/manual path: it lacks repeatable evaluation and structured rollback, so it cannot support an evidence-gated optimization claim.

## Consequences

- The Hermes learning path is decoupled from the existing `/learn` ingestion contract: one produces candidate behavior; the other records consent-gated observations and provenance.
- Profile proposal, evaluation, canary, promotion, and rollback contracts must be versioned before automation.
- Performance claims require task-family-specific verified outcomes, not model self-scores.
- A rejected proposal remains available for audit and deduplication.

## Acceptance conditions

1. Hermes cannot write an active or committed profile during a kernel-managed execution.
2. Equivalent proposal content deduplicates by fingerprint.
3. Evaluation uses fixed inputs and records the worker/runtime version.
4. Promotion requires an independent approval and creates a rollback-capable version.
5. Canary regression automatically prevents promotion and preserves evidence.

## Recovery

Set the active profile pointer to the last accepted version and append a rollback event. Never delete the rejected or rolled-back proposal and evaluation history.
