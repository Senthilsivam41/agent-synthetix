# AGENTS.md

## Cursor Cloud specific instructions

### What this repository is
`agent-synthetix` (aka **AutoClaw**) is a **file-native, tool-agnostic multi-agent AI operating system**. It is NOT a conventional software application:

- There is **no source code, build system, package manifest, lockfile, or runtime service**. The repo is Markdown only (`README.md`, `BRAINSTORM.md`, `docs/`, and rule/skill definitions under `.agent/rules/` and `.claude/rules/`). Architecture detail lives in `docs/architecture-principles.md`.
- The "runtime" is an AI coding agent (you) that **reads the rule files and executes the documented slash-commands**, materializing all state as plain files under `.autoclaw/` (which is gitignored — see `.gitignore`).
- Because of this, there is **nothing to install** and the update script is intentionally a no-op.

### How to "run" the product (dev workflow)
Act as the agent described in `.agent/rules/*.md` and execute the slash-commands. The canonical first run (Quick Start in `README.md`):

1. `/orchestrate init` — creates `.autoclaw/orchestrator/config.yaml` + `manifests/ sprints/ reviews/ logs/`.
2. Create a task manifest YAML in `.autoclaw/orchestrator/manifests/`.
3. `/orchestrate plan` — parses the manifest, builds a dependency DAG (Kahn topological sort), enforces scope isolation, and bin-packs tasks into `sprints/sprint-N.yaml` + `plan-summary.yaml`/`.md`.
4. `/orchestrate status` — renders progress from the generated sprint/state files.

Other subsystems (`/learn`, `/index-code`, `/kdream start`, `/autobuild`, `/mateam`) follow the same pattern: read the matching `.agent/rules/*.md` file, then operate on files under `.autoclaw/`.

### Non-obvious caveats
- **Use file tools (Write/edit), not shell (`mkdir`/`touch`), to create `.autoclaw/` paths** — the rules mandate this for cross-platform safety. Always use forward slashes.
- **All command output lives under `.autoclaw/`, which is gitignored.** Running the system produces no committable diff by design; don't expect generated state to show up in `git status`. Do **not** force-add or commit `.autoclaw/` (including KDream). See [docs/autoclaw-and-kdream.md](./docs/autoclaw-and-kdream.md).
- Commands must be **idempotent** — re-running `init`/`plan` updates state in place rather than duplicating it.
- The rule files reference an aspirational TypeScript/VS Code-extension implementation (`src/...`, `package.json`, MCP tools) that **does not exist in this repo**. Treat those as future/spec references, not runnable code.
- There is no GUI, server, port, or test suite to run. Verification means inspecting the generated files under `.autoclaw/` for correctness (e.g. valid DAG levels + no overlapping scopes between parallel agents in a sprint).
