# Implementation plan: accessibility, learning adapters, publishing profiles, and Pages

1. Accessibility baseline and remediation
   - Add axe/jsdom coverage and keyboard-focus tests.
   - Add skip navigation, route focus, labelled file selection, captions, robust live regions, high-contrast/reflow styling, and reduced-motion behavior.
   - Re-test automated rules and document manual coverage limits.
2. `/learn` multi-tool ingestion
   - Encode source adapters, verified/default locations, consent behavior, formats, and kept-signal policy.
   - Add a versioned learning provenance schema and fixture-backed conformance tests.
   - Update intelligence rules and architecture documentation.
3. ThreadHermes and ReportHermes
   - Replace scaffolds with complete invocation, validation, generation, diff, output, and failure contracts.
   - Add representative examples and schema conformance tests.
4. Hermes Pages first release
   - Validate Jekyll content and workflow configuration.
   - Commit implementation on the isolated branch.
   - Create/update `content` from a clean worktree, push, monitor Actions, verify the public URL, and retain a rollback commit reference.
5. Closeout
   - Update roadmap and memory status honestly.
   - Sync CodeGraph, run full checks, push the implementation branch.
