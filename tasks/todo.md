# Tasks: Control-plane backlog completion

- [x] Task 1: Generate and enforce strict schemas
  - Acceptance: all public contracts have strict generated definitions; invalid external fields/types/versions fail.
  - Verify: `cd console && npm test -- tests/contracts.test.ts && npm run generate:schemas`
  - Files: contracts/schema generator, generated schema, validator, contract tests.

- [x] Task 2: Complete Clarify workflow
  - Acceptance: request questions, show up to five, atomically save answers, queue draft plan.
  - Verify: focused workflow tests and `npm run build`.
  - Files: API plugin/client, Clarify screen, workflow utilities/tests.

- [x] Task 3: Complete Plan Review and Approve workflow
  - Acceptance: readable plan, revision feedback, scope blocking, consequence panel, approval status.
  - Verify: focused workflow tests and `npm run build`.
  - Files: API client/plugin, Plan/Approve screens, styles/tests.

- [x] Task 4: Add reactive command activity
  - Acceptance: relevant file changes emit coalesced SSE invalidations; pending and processed commands refresh automatically.
  - Verify: watcher/parser tests, build, runtime HTTP smoke.
  - Files: watcher, API plugin/client, activity component, tests/styles.

- [x] Task 5: Run credential-gated live router proof
  - Acceptance: live temporary-repository task reaches accepted with independent review, or reports a credential-based skip.
  - Verify: live smoke script output and retained non-secret report.
  - Files: smoke harness and operating documentation.

- [x] Task 6: Final project-state refresh
  - Acceptance: full suite/build pass; backlog/status and CodeGraph reflect the result.
  - Verify: `npm test`, `npm run build`, `codegraph sync`, `git diff --check`.
  - Files: memory and relevant docs.
