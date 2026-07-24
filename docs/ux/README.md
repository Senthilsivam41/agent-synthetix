# UX documentation

Design specifications for AutoClaw end-user surfaces. These are **specs only** — this repository remains Markdown + agent rules; there is no app binary to run.

| Spec | Purpose |
|---|---|
| [Orchestrate Control Console](./orchestrate-console.md) | Guided UI for intake → clarify → plan review → approve → sprint status |
| [Design tokens](./design-tokens.md) | Color, type, spacing, motion, and focus tokens for that console |

## How to use

1. Read [orchestrate-console.md](./orchestrate-console.md) for IA, screens, flows, a11y, and slash-command handoff.
2. Read [design-tokens.md](./design-tokens.md) before implementing any visual UI.
3. Keep behavior aligned with [`.agent/rules/orchestrate.md`](../.agent/rules/orchestrate.md) and the on-disk paths under `.autoclaw/orchestrator/`.

## Out of scope here

- Hermes content approval UX (see [BRAINSTORM.md](../BRAINSTORM.md) §3)
- GitHub Pages public reader site
- Figma source files or a shipped frontend
