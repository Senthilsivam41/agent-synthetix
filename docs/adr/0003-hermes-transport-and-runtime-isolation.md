# ADR 0003 — Hermes transport and runtime isolation

- Status: Proposed
- Date: 2026-08-11
- Depends on: [ADR 0002](./0002-hermes-agent-as-governed-worker.md)

## Context

Hermes exposes ACP over stdio, a TUI gateway over stdio or WebSocket, an OpenAI-compatible HTTP run API, and A2A v1.0. The locally installed Hermes version is v0.17, while the proposed compatibility target is the pinned v0.20 release. Hermes runtime dependencies need not match the console's Node 22.13+ runtime.

The first adapter must guarantee that Hermes executes in the kernel-assigned worktree, supports structured cancellation and approvals, and cannot gain database or orchestration authority.

## Decision

Use staged transports:

1. **Local conformance:** launch the Hermes TUI JSON-RPC gateway over stdio with the process working directory set to the assigned worktree.
2. **Hosted/sidecar option:** add authenticated HTTP `/v1/runs` plus event streaming only after explicit workspace-mount and resumption contracts pass conformance.
3. **A2A option:** use A2A for discovery and message transport only after the local adapter is accepted. Every task still travels inside the canonical agent-synthetix assignment envelope.

Keep Hermes in a separately managed, pinned runtime. Do not change the console runtime requirement to match Hermes. Record the Hermes version, transport version, capability snapshot, external run ID, external session ID, and endpoint or PID with every execution.

## Alternatives considered

### ACP as the first transport

- Benefit: standardized IDE-facing protocol with permissions and cancellation.
- Rejected as the default: the agent-synthetix kernel is a custom host and needs Hermes-specific session, clarification, approval, delegation, and streaming controls exposed most completely by the TUI gateway.

### HTTP API as the first transport

- Benefit: language-neutral and naturally supports future remote operation.
- Deferred: a remote or long-lived sidecar needs explicit worktree mounting, authentication, event resumption, and lifecycle ownership before it can preserve local execution guarantees.

### A2A as the only transport

- Benefit: standard heterogeneous-agent interoperability.
- Rejected: A2A does not replace repository scope leases, deterministic gates, worktree ownership, or acceptance contracts.

### Import Hermes in-process

- Benefit: lowest transport overhead.
- Rejected: couples Python/runtime dependencies and failure domains to the Node kernel, complicating upgrades and cancellation.

## Consequences

- Local adapter tests can exercise deterministic stdio fixtures without network credentials.
- HTTP and A2A remain additive transports behind the same `WorkerAdapter` contract.
- Runtime upgrades require a capability/conformance check before enablement.
- The kernel owns timeout escalation and process termination for local runs.
- Secrets pass only through a configured allowlist; diagnostics are redacted before persistence.

## Acceptance conditions

1. The adapter detects and reports missing or incompatible Hermes versions.
2. The process starts in the assigned worktree and cannot change the kernel workspace root.
3. Cancellation follows graceful interrupt then forced termination with a recorded reason.
4. Approval, clarification, event, and completion messages are schema validated.
5. No credential appears in arguments, logs, events, or stored diagnostics.
6. The v0.17 installation remains recoverable until the pinned v0.20 suite passes.

## Recovery

Disable the Hermes adapter and stop its process/sidecar. Adapter correlation state remains in SQLite for audit, while execution cleanup follows the existing worktree policy.
