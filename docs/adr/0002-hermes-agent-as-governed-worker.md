# ADR 0002 — Hermes Agent as a governed worker

- Status: Proposed
- Date: 2026-08-11
- Depends on: [ADR 0001](./0001-control-plane-execution-authority.md)

## Context

Hermes Agent v0.20 provides long-running tool use, completion contracts, delegation, programmatic run control, grounded citations, lifecycle events, and A2A interoperability. agent-synthetix currently supports a mock path and a dual-router subprocess inside a kernel-created Git worktree.

Directly adopting Hermes planning, worktrees, Kanban state, self-verification, or approvals as authoritative would create a second control plane. That would violate ADR 0001 and weaken the product's collision-prevention and evidence-gated completion claims.

The repository also uses “Hermes” for content-generation profiles. The runtime and those profiles are separate architectural concepts.

## Decision

Integrate Hermes Agent as a worker behind a common `WorkerAdapter` interface.

- The kernel creates and owns the assignment, session, lease, execution, worktree, gates, evidence projection, review, and terminal state.
- `HermesAgentAdapter` translates the assignment into a Hermes completion contract and runs Hermes inside the assigned worktree.
- Hermes-produced completion, verification, citations, tool logs, delegation results, and events are reported evidence.
- The kernel independently collects Git/filesystem artifacts, validates scope, runs required gates, and requests review.
- Hermes cannot merge, deploy, acquire scopes, mutate assignments, downgrade gates, or mark an execution accepted.
- Code and docs use `content_hermes` for repository profiles and `hermes_agent` for the external runtime where ambiguity is possible.

## Alternatives considered

### Replace the kernel with Hermes Kanban and project management

- Benefit: less integration code and immediate use of Hermes surfaces.
- Rejected: creates vendor/runtime coupling and loses the existing SQLite, lease, schema, worktree, and independent-review guarantees.

### Run Hermes as an unstructured shell command

- Benefit: simplest proof of concept.
- Rejected: no capability negotiation, lifecycle correlation, structured cancellation, approval handling, or evidence contract.

### Treat Hermes as a hosted control plane

- Benefit: could centralize agents and user surfaces.
- Rejected for this tranche: conflicts with the local-first product boundary and is unnecessary for proving the worker adapter.

### Do not integrate Hermes

- Benefit: avoids version and transport complexity.
- Rejected: Hermes provides a meaningful heterogeneous worker and exercises the control plane's vendor-neutral claim.

## Consequences

- The current adapter function must become a registry/interface without changing kernel authority.
- Adapter type and version become execution provenance.
- Hermes self-verification can improve worker behavior but never shortens the acceptance path.
- Nested Hermes delegation must remain inside the parent execution's scopes and evidence boundary.
- Content Hermes continues to work with other host agents; it does not require Hermes Agent.

## Acceptance conditions

This ADR may move to Accepted only when:

1. A mock-backed `HermesAgentAdapter` passes the worker-adapter conformance suite.
2. A pinned local Hermes runtime completes a task inside the kernel-created worktree.
3. Out-of-scope changes are rejected regardless of Hermes completion claims.
4. Acceptance remains impossible without required gates and independent review.
5. Existing mock and dual-router tests remain green.

## Recovery

Hermes remains an optional adapter. Disable its registration to return to mock and dual-router execution. No authoritative state is stored only inside Hermes.
