# Spec: Console accessibility, Hermes learning, publishing profiles, and first Pages release

## Objective

Complete the next four backlog items without changing the control-plane authority model: bring the localhost console to a verified WCAG 2.1 AA baseline, make `/learn` source discovery and provenance executable for five supported tools, make ThreadHermes and ReportHermes production-ready rule profiles, and publish the already-approved Hermes Jekyll site through the existing `content`-branch workflow.

## Boundaries

- Console accessibility covers keyboard-only use, landmarks/headings, labelled forms, live regions, 200% zoom/reflow, reduced motion, and AA contrast.
- `/learn` remains local-first and consent-gated. It never mutates third-party session stores and redacts before persistence.
- Tool adapters fail loudly when unavailable or when a storage format is unsupported; no source is silently reported as ingested.
- Thread and report drafts always enter `.autoclaw/hermes/pending/`; neither profile posts or publishes directly.
- Pages deployment includes only committed `site/**` and workflow content. `.autoclaw/` is never committed.

## Acceptance criteria

1. Automated axe checks report no WCAG A/AA violations for the primary console shell; keyboard focus moves predictably on step changes and a non-drag file picker is available.
2. `/sources` exposes AutoClaw, Claude Code, Claude Desktop export, Cursor, Kiro CLI, and Gemini CLI adapters with explicit path, consent, format, kept-signal, and confidence contracts.
3. `/learn` performs source discovery, incremental watermarks, redaction, workspace attribution, kept/discarded classification, deduplication, and provenance-stamped writes.
4. `/hermes thread` enforces the chosen platform limits and writes an approval-gated draft.
5. `/hermes report` compares against the previous report, emits semantic/lexical change markers, and writes an approval-gated draft.
6. The Jekyll site builds, Pages configuration is enabled, the `content` branch deploys, and the public URL is verified; if external authentication blocks this, local proof and the precise blocker are recorded.

## Verification

- `cd console && npm test && npm run build`
- Contract tests for Hermes profiles and `/learn` source configuration
- Jekyll build through Bundler or a container-equivalent local check
- GitHub Actions run and deployed URL check
- `codegraph sync` and scoped `git diff --check`
