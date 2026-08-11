# Spec: Control-plane backlog completion

## Objective

Complete the next four research-preview backlog items: strict generated control-plane schemas, the remaining guided planning screens, automatic filesystem-driven refresh with command history, and a credential-gated live dual-router acceptance run. A project owner must be able to move from clarifications through explicit approval without manually reading runtime files, while external control-plane messages are rejected unless they conform exactly to the versioned contracts.

## Tech Stack

- Node.js 22.13+, TypeScript 5.7, Vite 6, React 19
- Built-in `node:sqlite`, YAML 2
- Vitest 3
- JSON Schema Draft 2020-12 generated from TypeScript and enforced with Ajv
- Server-Sent Events over the existing localhost Vite plugin

## Commands

- Install: `cd console && npm install`
- Generate schemas: `cd console && npm run generate:schemas`
- Focused tests: `cd console && npm test -- <test-file>`
- Full tests: `cd console && npm test`
- Build: `cd console && npm run build`
- Dev: `cd console && npm run dev`
- Headless status: `cd console && npm run control-plane -- status --workspace ..`

## Project Structure

- `console/plugins/control-plane/` — contracts, validation, kernel, adapter
- `console/schemas/` — committed generated JSON Schema bundle
- `console/plugins/orchestratorFsApi.ts` — localhost HTTP and SSE adapter
- `console/src/screens/` — guided workflow and command activity screens
- `console/src/lib/` — browser API and event-stream client
- `console/tests/` — unit and integration tests
- `console/scripts/` — deterministic schema generation and live smoke harness
- `memory/` and `docs/` — current/future state and operating documentation

## Code Style

Use strict TypeScript, named exports for reusable components, semantic HTML, existing design tokens, and explicit error/loading/empty states.

```tsx
export function ActionStatus({ message }: { message: string }) {
  return <p role="status" className="muted">{message}</p>;
}
```

## Testing Strategy

- Unit: strict schema acceptance/rejection, clarification parsing/serialization, plan metadata, command log parsing.
- Integration: API file writes remain inside `.autoclaw/orchestrator`; SSE watcher emits coalesced domain events; adapter live harness uses a temporary clean Git repository.
- UI: TypeScript build plus browser runtime verification when a browser tool is available.
- External: live dual-router execution is attempted only when a supported model credential exists; absence is an explicit skipped result, never a mocked success.

## Boundaries

- Always: preserve SQLite authority, atomic file writes, accessibility semantics, event-stream cleanup, secret redaction, and existing compatibility endpoints.
- Ask first: hosted services, remote authentication, automatic merge, or changes to dual-router itself.
- Never: print or persist credential values, run live model work in the dirty primary repository, commit `.autoclaw/`, or weaken required review/gates.

## Success Criteria

1. A repeatable command generates committed strict schemas for all public control-plane contracts; runtime event and verdict validation rejects missing, mistyped, unknown, and unsupported-version fields.
2. Clarify can request questions, display at most five, save answers atomically, and queue plan drafting.
3. Plan Review renders safe structured Markdown text, surfaces missing-scope warnings, queues revision feedback, and advances to approval.
4. Approve clearly states consequences, blocks invalid plan states/scopes, queues approval, and reflects manifested completion.
5. The server watches relevant runtime files, emits coalesced SSE notifications, and the UI shows pending and processed commands without page reload.
6. When credentials exist, a temporary-repository dual-router run reaches `accepted` only after deterministic gates and an independent reviewer verdict. Without credentials, the result is reported as skipped.
7. `npm test` and `npm run build` pass; memory and CodeGraph are refreshed.

## Open Questions

None blocking. Compatibility commands remain agent-drained; this slice observes and displays their state rather than adding a new autonomous command executor.
