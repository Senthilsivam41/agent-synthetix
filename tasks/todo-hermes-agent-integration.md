# Tasks: governed Hermes Agent integration

## H0 — Compatibility

- [x] H0.1 Record installed/target versions and capability snapshot
- [x] H0.2 Establish isolated install and rollback procedure
- [x] Checkpoint H0 reviewed

## H1 — Common worker contract

- [x] H1.1 Introduce `WorkerAdapter`; preserve mock and dual-router behavior
- [x] H1.2 Add adapter registrations and capability snapshots
- [x] Checkpoint H1 passes existing conformance suites

## H2 — Local Hermes vertical slice

- [x] H2.1 Translate assignments into immutable completion contracts
- [x] H2.2 Implement local stdio JSON-RPC transport
- [x] H2.3 Prove accepted and deliberate scope-violation paths
- [ ] Checkpoint H2 reviewed before enabling Hermes

Fixture and kernel conformance are present. The Hermes Agent adapter remains **disabled** by default (`hermes_enabled` must be true, registration health is `unavailable`). ADRs 0002 and 0003 stay Proposed until a pinned 0.20 runtime passes live smoke and human review. CI uses the JSON-RPC fixture, not a live Hermes binary.

## H3 — Events and evidence

- [ ] H3.1 Add authenticated raw delivery and normalized event contracts
- [ ] H3.2 Add grounded citation evidence for Research/Report Hermes
- [ ] Checkpoint H3 passes security review

## H4 — Operator surfaces

- [ ] H4.1 Extend API and console with Hermes run/evidence status
- [ ] Checkpoint H4 qualifies the developer-preview candidate

## H5 — Optional A2A

- [ ] Obtain explicit approval after H4
- [ ] H5.1 Add constrained A2A edge adapter

## H6 — Controlled profile proposals

- [ ] Approve controlled-evolution contracts and data threshold
- [ ] H6.1 Import Hermes learning as inactive proposals
- [ ] H6.2 Add evaluation, canary, promotion, and rollback
- [ ] Checkpoint H6 demonstrates ADR 0005 conditions

## Standing verification

- [x] Focused tests pass for each task
- [x] `cd console && npm test`
- [x] `cd console && npm run build`
- [x] No credentials appear in persisted fixtures or diagnostics
- [x] Documentation and `memory/` match shipped versus proposed state
- Codegraph re-index is operator-manual; not an agent verification step
