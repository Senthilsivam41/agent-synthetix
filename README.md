# agent-synthetix

> **A self-hosted, multi-agent AI operating system** — autonomous research, content creation, code authoring, and continuous self-improvement — coordinated by a file-native agent layer that survives reboots, survives switching AI tools, and requires no hidden server.

**Docs:** [How to run locally](./docs/how-to-run.md) · [Architecture principles](./docs/architecture-principles.md) · [`.autoclaw` / KDream check-in policy](./docs/autoclaw-and-kdream.md) · [Docs index](./docs/README.md) · [Open design questions](./BRAINSTORM.md)

> **Slash-commands are not a terminal CLI.** Type `/orchestrate init` in **Cursor Agent chat**, not in the shell. See [docs/how-to-run.md](./docs/how-to-run.md).

---

## What This Is

`agent-synthetix` is not a single AI assistant. It is a **fleet of specialized AI agents** sharing one workspace, one memory store, and one coordination bus — all through plain files under `.autoclaw/`.

The system orchestrates agents from any IDE or CLI (Claude Code, Kiro, Cursor, Antigravity, Windsurf, Copilot) and lets them collaborate on the same repo without colliding. Each agent knows its role, its scope, and its peers.

### Implementation approach (summary)

| Layer | What it is |
|---|---|
| **Instruction set** | `.agent/rules/*.md` — host-agnostic specs the AI agent executes |
| **Runtime** | The host AI agent (you / Cursor / Claude Code / …) running slash-commands |
| **State** | `.autoclaw/` — gitignored runtime (do not check in); file-native board, memory, vector store, inboxes — see [check-in policy](./docs/autoclaw-and-kdream.md) |
| **No app binary required here** | This repo is Markdown + rules; there is no package.json or server to start |

Full design detail — principles, DAG algorithm, message bus, store separation, and lifecycle — lives in **[docs/architecture-principles.md](./docs/architecture-principles.md)**.

---

## Core Subsystems

### AutoClaw — Coordination, Memory & Learning Layer

The backbone. Every subsystem writes and reads through `.autoclaw/`.

| Component | Path | Purpose |
|---|---|---|
| **Vector Store** | `.autoclaw/vector/db.sqlite` | Semantic code + learning index (`/retrieve`, `/search`) |
| **Knowledge Graph** | `.autoclaw/kg/kg.db` | Multi-agent coordination facts: decisions, consensus, review findings |
| **Learnings** | `.autoclaw/learnings/` | Timestamped session distillations (kept vs. discarded patterns) |
| **Orchestrator** | `.autoclaw/orchestrator/` | Sprint plans, agent assignments, inbox/consensus bus |
| **KDream Memory** | `.autoclaw/kdream/memory/MEMORY.md` | Long-lived project memory (append-only) |

**Key commands:**

```
/learn          — Distill kept-vs-discarded patterns from past AI sessions
/index-code     — Chunk + embed the codebase into the vector store
/retrieve <q>   — Semantic code/learning retrieval
/search <q>     — Search distilled learnings
/metrics        — Token usage, kept-rate dashboard
/scaffold       — Emit learned agent-style.md for a new task prompt
/rag-generate   — Build a grounded RAG prompt from code + learnings + memory
```

Do not confuse stores: `/index-code` writes **only** the vector store; the knowledge graph is written by `/learn` and the orchestrator.

---

### Orchestrate — Multi-Agent Sprint Planner

Reads task manifests, builds a dependency DAG, generates sprint plans, and assigns scoped work to parallel agents.

```
/orchestrate init         — Initialize orchestrator config
/orchestrate plan         — Build DAG → assign sprints from manifest YAML
/orchestrate assign <N>   — Assign sprint N to agents (writes context packs)
/orchestrate status       — Show progress + stalled agents
/orchestrate review <N>   — Trigger quality gates and review for sprint N
/orchestrate merge <N>    — Merge approved sprint to develop
/orchestrate next         — Assign the next unblocked sprint
/orchestrate revive <id>  — Wake a stalled agent with the right keepalive prompt
```

Sprint planner uses: topological sort (Kahn), bin-packing, scope-conflict detection, capability-aware routing, and migration range allocation. **Scope isolation is enforced** — no two parallel agents share file patterns.

See [Architecture Principles §5.1](./docs/architecture-principles.md#51-orchestrate--sprint-dag-planner) for the full plan algorithm.

---

### MAteam — Role-Based Agent Pipeline

Decomposes a task into four sequential roles and dispatches them as real subagents (if the host supports it) or simulates them in-session:

| Role | Responsibility |
|---|---|
| **Researcher** | Gathers context: reads files, searches codebase, identifies dependencies |
| **Coder** | Implements changes from Researcher's findings |
| **Reviewer** | Audits for logic errors, security issues, style, edge cases |
| **Verifier** | Runs tests/build, confirms acceptance criteria |

```
/mateam launch "<task>"   — Spawn the team
/mateam status            — Show active sessions
/mateam cancel            — Halt all agents
/mateam result            — Collect and merge outputs
```

Scratchpad: `.autoclaw/mateam/scratch/<session>/` (plan.md, context.md, output.md, review.md, verify.md)

---

### KDream — Persistent Background Daemon

Always-on background agent. Watches git status, scans for TODO/FIXME drift, consolidates memory, and surfaces follow-ups.

```
/kdream start     — Launch the daemon (idempotent)
/kdream ps        — Status: tick count, open TODOs, follow-ups
/kdream logs      — Last 30 lines from today's log
/kdream dream     — Force a memory consolidation cycle now
/kdream add <note>— Add a follow-up task to MEMORY.md
/kdream todo      — List all open code TODOs + manual follow-ups
/kdream work <n>  — Actively resolve a follow-up item
/kdream stop      — Shut down
```

**autoDream cycle** (every 20 ticks or 24h): Gathers 7 days of logs → consolidates MEMORY.md → deduplicates → archives oldest observations if >200 lines. Facts carry `verified_by` provenance stamps.

---

### AutoBuild — Autonomous Workflow Engine

Cron-scheduled and one-shot build/test/deploy workflows. Supports guarded fix mode with automatic rollback.

```
/autobuild schedule "<cron>" <name>   — Register a scheduled workflow
/autobuild run <name>                  — Execute immediately
/autobuild list                        — Show all workflows + scheduler health
/autobuild cancel <name>               — Remove workflow
/autobuild status <name>               — Last run result
```

**Guarded Fix Mode:** steps can declare `mode: fix` with `guard.scope_globs`, `max_files`, `require_clean_git`, and `rollback_on: test_fail` — automatic git rollback if verify command fails.

---

### Security Auditor

Continuous security review agent. Reviews code for vulnerabilities, secrets, injection risks, and policy violations. Emits `finding_report` messages into the consensus bus. Security findings require **unanimous** consensus before merge.

---

### Doc Writer

Automated documentation agent. Generates and keeps docs in sync with code/public-API changes. Writes docs + CHANGELOG only; surfaces doc/code drift as `finding_report` rather than silently rewriting truth.

---

### Cross-Agent Protocol

All agents share a message bus via plain JSON files:

- **Inboxes:** `.autoclaw/orchestrator/comms/inboxes/<agent-id>/` + `inboxes/shared/`
- **Consensus:** `.autoclaw/orchestrator/comms/consensus/active/` — 2/3 majority to approve; unanimous for security findings
- **Heartbeats:** `.autoclaw/orchestrator/comms/heartbeats/` — stall detection

Message types: `review_request`, `task_complete`, `consensus_vote`, `finding_report`, `question`, `subcontract_request`, `thought_record`, and more.

Every message carries: `id`, `session_id`, `from`, `to`, `type`, `timestamp`.

Details: [Architecture Principles §5.2](./docs/architecture-principles.md#52-cross-agent-protocol--file-bus).

---

## Agent Roster (Current)

| Agent ID | Host | Role |
|---|---|---|
| `antigravity` | Antigravity IDE | General-purpose coder, orchestrator |
| *(add your agents here)* | | |

---

## Quick Start

> Commands below are sent in **agent chat**, not the terminal. Full guide: [docs/how-to-run.md](./docs/how-to-run.md).

### 1. Initialize the orchestrator
```
/orchestrate init
```

### 2. Orient yourself (any agent)
Read `.autoclaw/AGENT-ORIENTATION.md` — the authoritative description of every command, every path, and common mistakes to avoid. (Generated at runtime; do not hand-author.)

### 3. Index your codebase
```
/index-code
```

### 4. Learn from past sessions
```
/learn
```

### 5. Start the background daemon
```
/kdream start
```

### 6. Plan a sprint from tasks
Create a manifest YAML in `.autoclaw/orchestrator/manifests/`, then:
```
/orchestrate plan
/orchestrate assign 1
```

For Cursor Cloud / agent-environment notes, see [AGENTS.md](./AGENTS.md).

---

## File Layout

```
.autoclaw/                     ← runtime state (gitignored — do NOT check in; see docs/autoclaw-and-kdream.md)
  AGENT-ORIENTATION.md         ← read this first (auto-generated)
  agent-style.md               ← learned patterns (auto-regenerated by /learn)
  vector/                      ← semantic vector store
  kg/                          ← knowledge graph (coordination facts)
  learnings/                   ← distilled session insights
  kdream/memory/MEMORY.md      ← long-lived project memory (append-only)
  orchestrator/
    config.yaml                ← global settings
    board.json / board.md      ← active tasks + sprint status
    sprints/                   ← sprint YAMLs + context packs
    manifests/                 ← task manifest YAMLs
    comms/inboxes/             ← per-agent + shared mailboxes
    comms/consensus/           ← active + resolved votes
    comms/heartbeats/          ← agent liveness
  mateam/scratch/              ← per-session scratchpads
  autobuild/
    workflows/                 ← cron workflow YAMLs
    registry.json              ← scheduler registry
    runs/                      ← run logs

.agent/rules/                  ← agent skill/rule definitions (host-agnostic)
.claude/rules/                 ← Claude-specific rule overrides
docs/                          ← architecture principles & documentation index
```

---

## Non-Functional Principles

| Principle | Implementation |
|---|---|
| **Local-first** | All state in `.autoclaw/` files — no hidden server, no cloud dependency |
| **Tool-agnostic** | Works with: Antigravity, Claude Code, Kiro, Cursor, Copilot, Windsurf |
| **Transparent** | Every action logged; all state is human-readable files |
| **Safe by default** | Human approval gates, scope isolation, guarded fix mode with rollback |
| **Consent-first** | Third-party session ingestion is opt-in; secrets/PII redacted before embedding |
| **Idempotent** | All commands are safe to re-run; no duplicate state |
| **Extensible** | Add new Hermes profiles, autobuild workflows, or agent rules as plain files |

Expanded rationale and invariants: [docs/architecture-principles.md](./docs/architecture-principles.md).

---

## Hermes Profiles (Specialized Agent Personalities)

Hermes profiles are personality definitions loaded via `.agent/rules/`. Current profiles:

| Profile | Trigger | Specialty |
|---|---|---|
| **Orchestrate** | `/orchestrate`, `plan sprints` | DAG-based sprint planning and agent coordination |
| **MAteam** | `/mateam launch`, `spawn agents` | Researcher → Coder → Reviewer → Verifier pipeline |
| **KDream** | `/kdream start`, `persistent daemon` | Background memory and follow-up daemon |
| **AutoBuild** | `/autobuild schedule`, `automate build` | Cron workflows with guarded fix mode |
| **Intelligence** | `/learn`, `/index-code` | Learning distillation and RAG retrieval |
| **Security Auditor** | `security review`, `audit` | Vulnerability and policy review |
| **Doc Writer** | `write docs`, `sync docs` | Documentation generation and maintenance |
| **Cross-Agent** | *(always active)* | Inbox checking, consensus voting, scope enforcement |

---

## Acceptance Criteria

- [ ] User gives a topic → agents research, summarize, generate content autonomously
- [ ] System spawns and coordinates multiple Hermes agents via sprint DAG
- [ ] All execution steps logged and human-reviewable
- [ ] Human can stop, modify, or approve at any checkpoint
- [ ] Stalled agents detected and revived automatically
- [ ] Memory persists across tool switches and reboots
- [ ] No two parallel agents write the same file scope
- [ ] Security findings require unanimous consensus before merge

---

## Further reading

| Doc | Contents |
|---|---|
| [docs/how-to-run.md](./docs/how-to-run.md) | Run slash-commands in agent chat (not the terminal) |
| [docs/architecture-principles.md](./docs/architecture-principles.md) | Design principles, subsystem contracts, end-to-end lifecycle, verification |
| [docs/autoclaw-and-kdream.md](./docs/autoclaw-and-kdream.md) | Why `.autoclaw/` / KDream exist; do not check them into git |
| [docs/README.md](./docs/README.md) | Documentation index |
| [BRAINSTORM.md](./BRAINSTORM.md) | Open product decisions (not yet shipped) |
| [AGENTS.md](./AGENTS.md) | How to run this repo as a Cursor Cloud agent |
| `.agent/rules/*.md` | Executable specifications for each subsystem |
