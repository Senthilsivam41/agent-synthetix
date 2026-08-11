# Implementation Plan: Control-plane backlog completion

## Overview

Deliver four vertical slices on top of the shared kernel: strict generated validation, guided soft-gate screens, reactive runtime/command visibility, and credential-gated live adapter proof.

## Architecture Decisions

- Generate one Draft 2020-12 definition bundle from TypeScript contracts and load it in the Node control-plane boundary through Ajv.
- Keep Clarify/Plan/Approve on compatibility files and slash-command intents; SQLite remains authoritative only for kernel execution state.
- Use SSE as invalidation-only transport. Browser clients refetch authoritative endpoints after coalesced filesystem events.
- Run live model work only in a generated temporary Git repository with a dedicated worker/reviewer pair.

## Task List

### Phase 1: Contract foundation

- [x] Add schema generator, committed output, strict runtime validator, and negative tests.
- [x] Validate externally submitted events, verdicts, plan manifests, and adapter configuration through generated schemas.

### Checkpoint: Contracts

- [x] Focused contract tests pass.
- [x] Schema regeneration produces no diff.

### Phase 2: Guided workflow

- [x] Add atomic clarification/plan/status endpoints and parsing tests.
- [x] Build Clarify screen and complete ask/save/draft flow.
- [x] Build Plan Review and Approve screens with warnings and deliberate consequences.

### Checkpoint: Workflow

- [x] Focused API/logic tests pass.
- [x] Console builds with accessible semantic structure.

### Phase 3: Reactive operations

- [x] Add coalesced filesystem watcher and SSE endpoint.
- [x] Add pending/processed command API and activity UI.
- [x] Wire global invalidation refresh and clean stream teardown.

### Phase 4: External proof

- [x] Detect credentials without revealing values.
- [x] Run or explicitly skip the temporary-repository live dual-router vertical slice. (Skipped: no supported credential in the process environment.)

### Checkpoint: Complete

- [x] Full tests and build pass.
- [x] Memory/docs and CodeGraph are current.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Generated schema diverges from runtime types | High | Deterministic generation plus clean-diff test |
| File watcher event storm or leaked handles | Medium | Path filtering, debounce/coalescing, close hooks |
| UI overwrites agent-authored files | High | Atomic writes and narrow endpoints; commands remain queued intents |
| Live router spends tokens or edits workspace | High | Credential gate, tiny task, temporary clean repository, timeout |
| Existing Hermes work is accidentally included | High | Do not edit or stage unrelated dirty files |

## Open Questions

- None blocking; credential absence produces a documented skip.
