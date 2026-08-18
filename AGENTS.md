# AGENTS.md

## Cursor Cloud specific instructions

### What this repository is
`agent-synthetix` is a **workspace-native, tool-agnostic agent control plane** with a compatibility rule layer:

- The deterministic kernel, headless command, localhost API, and UI live in `console/` (Node 22.13+, TypeScript, Vite, React, Vitest).
- The compatibility runtime remains an AI coding agent that reads rule files and executes slash-commands. Its direct file writes are advisory; only the kernel-managed path may claim collision prevention and evidence-gated completion.
- Authoritative control-plane state is SQLite WAL under gitignored `.autoclaw/`; JSON/YAML/Markdown are audit exports and compatibility projections.

### How to run the product (dev workflow)

Kernel-managed path:

1. `cd console && npm install`
2. `npm run control-plane -- init --workspace ..`
3. `npm test && npm run build`
4. `npm run dev` for the localhost console, or use the remaining `control-plane` subcommands headlessly.

Compatibility agent-chat path:
Act as the agent described in `.agent/rules/*.md` and execute the slash-commands. The canonical first run (Quick Start in `README.md`):

1. `/orchestrate init` — creates `.autoclaw/orchestrator/config.yaml` + `manifests/ sprints/ reviews/ logs/ intake/ plans/`.
2. Recommended: drop inputs in `intake/` → `/orchestrate intake` → `ask` → `propose` → review `plans/project-plan.md` → `/orchestrate approve` (writes manifest). Soft gate: you may still hand-author a manifest under `manifests/`.
3. `/orchestrate plan` — parses the manifest, builds a dependency DAG (Kahn topological sort), enforces scope isolation, and bin-packs tasks into `sprints/sprint-N.yaml` + `plan-summary.yaml`/`.md`.
4. `/orchestrate status` — renders progress from the generated sprint/state files.

Other subsystems (`/learn`, `/index-code`, `/kdream start`, `/autobuild`, `/mateam`) follow the same pattern: read the matching `.agent/rules/*.md` file, then operate on files under `.autoclaw/`.

### Non-obvious caveats
- **Use file tools (Write/edit), not shell (`mkdir`/`touch`), to create `.autoclaw/` paths** — the rules mandate this for cross-platform safety. Always use forward slashes.
- **All command output lives under `.autoclaw/`, which is gitignored.** Running the system produces no committable diff by design; don't expect generated state to show up in `git status`. Do **not** force-add or commit `.autoclaw/` (including KDream). See [docs/autoclaw-and-kdream.md](./docs/autoclaw-and-kdream.md).
- Commands must be **idempotent** — re-running `init`/`plan` updates state in place rather than duplicating it.
- The rule files reference an aspirational TypeScript/VS Code-extension implementation (`src/...`, `package.json`, MCP tools) that **does not exist in this repo**. Treat those as future/spec references, not runnable code.
- Orchestrate console UI (Vite) lives under `console/`. Kernel verification uses SQLite state, worktree diffs, configured gates, artifact manifests, and independent review; generated `.autoclaw/` files remain inspectable views.
- **Project memory:** read/update [`memory/STATUS.md`](./memory/STATUS.md) and [`memory/FUTURE.md`](./memory/FUTURE.md) around milestones. Standing rules: [`memory/AGENT-CONVENTIONS.md`](./memory/AGENT-CONVENTIONS.md).
- **Codegraph:** when `.codegraph/` exists, use `codegraph_explore` to find files/symbols — do not full-repo Grep/Glob. The operator updates the index manually; do not run `codegraph init` / `sync` / `index`, and do not prompt for it after a slice.
