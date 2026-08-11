# Architecture Principles

This document describes the **detailed implementation approach** for agent-synthetix (AutoClaw): why the system is shaped the way it is, how subsystems compose, and which invariants every agent and contributor must respect.

---

## 1. Problem Statement

AI coding agents are powerful in a single session and fragile across sessions:

- Context evaporates when a chat ends or the user switches tools.
- Parallel agents collide on the same files with no shared plan.
- Institutional knowledge (what worked, what was discarded, security findings) lives in human memory or scattered notes.
- Most “multi-agent” setups depend on a hidden server, proprietary memory, or a single IDE.

**agent-synthetix** solves this by making coordination, memory, and learning **first-class, file-native contracts** that any IDE/CLI agent can read and write.

---

## 2. Core Thesis

> **Host agents do the cognitive work; the local kernel owns mechanical truth.**
> Rule files remain the portable instruction set. SQLite WAL under `.autoclaw/` is authoritative for kernel-managed identities, leases, transitions, evidence, and reviews; files remain the open audit and compatibility layer. There is no mandatory cloud control plane.

Implications:

| Implication | Practice |
|---|---|
| State survives reboots and tool switches | Everything durable lives under `.autoclaw/` (gitignored runtime state) |
| Any tool can participate | Claude Code, Cursor, Kiro, Copilot, Windsurf, Antigravity, etc. |
| Humans can audit everything | SQLite is authoritative; immutable JSON events, YAML projections, and Markdown summaries remain inspectable |
| Idempotency is mandatory | Re-running `/orchestrate plan`, `/learn`, or `/kdream start` must not duplicate or corrupt state |
| Spec ≠ aspirational runtime | Rule files may reference future TypeScript/MCP surfaces; this repo’s runtime is the agent executing those rules |

---

## 3. Design Principles

### 3.1 Local-first

All coordination and memory default to the workspace filesystem. Cloud or hosted backends (Postgres vector store, OpenClaw runners) are optional scale-out paths, never prerequisites.

### 3.2 Tool-agnostic

Subsystems detect host capabilities and degrade gracefully:

- **MAteam**: use a real `Agent` subagent tool when present; otherwise run roles in-session with scratchpad handoffs.
- **Intelligence**: embeddings backend may be `transformers`, `ollama`, or `none` (degraded retrieval still works).
- **Orchestrate revive**: keepalive templates are per-agent (`slash-loop`, `plain-message`, `cli-headless`, `bridge-relayed`).

### 3.3 Transparent & auditable

Every action that matters leaves a file trail: sprint YAMLs, inbox messages, consensus votes, run logs, learnings, MEMORY.md appends. A human (or peer agent) can reconstruct what happened without attaching a debugger.

### 3.4 Safe by default

| Safety mechanism | Rule |
|---|---|
| Scope isolation | Parallel agents in the same sprint never share overlapping file globs |
| Approval / quality gates | Sprint merge waits on review + configured gates |
| Security consensus | Security findings require **unanimous** approval; ordinary tasks need **2/3** |
| Guarded fix mode (AutoBuild) | Scoped edits + `rollback_on: test_fail` |
| Consent-first learning | Third-party session ingestion is opt-in; secrets/PII redacted before embedding |

### 3.5 Idempotent commands

Creating an existing directory is a no-op. `plan` regenerates in place. `assign` updates assignments. `start` on a running KDream ticks instead of resetting. Append/merge for MEMORY.md and preferences — never blind overwrite of durable memory.

### 3.6 File tools over shell for state

Agents create `.autoclaw/**` paths with the host’s Write/edit tools, not `mkdir -p` / `touch`. Paths always use forward slashes. This avoids Bash/PowerShell/cmd divergence and keeps state creation portable.

### 3.7 Separation of stores

Do not conflate stores. Each has one job:

| Store | Path | Owns |
|---|---|---|
| Vector store | `.autoclaw/vector/db.sqlite` | Embedded code + learning chunks for `/retrieve` |
| Knowledge graph | `.autoclaw/kg/kg.db` | Coordination facts: decisions, consensus, findings, patterns |
| Learnings | `.autoclaw/learnings/` | Distilled kept-vs-discarded session insights |
| KDream memory | `.autoclaw/kdream/memory/MEMORY.md` | Long-lived project memory (append-only) |
| Orchestrator board | `.autoclaw/orchestrator/` | Sprint DAG, assignments, inboxes, consensus, heartbeats |
| Control-plane store | `.autoclaw/orchestrator/control-plane.db` | Kernel-managed identities, leases, executions, events, evidence, and reviews |

`/index-code` writes **only** the vector store. `/learn` and the orchestrator write the KG. Hand-authored copies of generated steering files (e.g. `AGENT-ORIENTATION.md`) are forbidden — they drift.

### 3.8 One job per subsystem

Each Hermes profile / rule file owns a narrow surface. Cross-cutting concerns (inbox check, scope enforcement, consensus) live in the Cross-Agent protocol and are always active.

### 3.9 Hermes profiles (content)

Hermes is a **host-agnostic instruction set** (not a hosted runner). Profiles use directory-per-profile layout under `.agent/rules/hermes/<profile>/`:

| File | Role |
|---|---|
| `profile.md` | Persona, algorithms, slash-command behavior (loaded by host) |
| `prompt.md` | Templated prompt with `{{variables}}` |
| `tone.yaml` | `formality` / `voice` / `verbosity` / `audience` |
| `examples/` | Few-shot samples |
| `platforms.yaml` | ThreadHermes only — per-platform char limits |

`tone.yaml` enums:

```yaml
formality: technical | casual | executive
voice: first_person | third_person
verbosity: terse | standard | expansive
audience: internal_team | public | client
```

Runtime (gitignored): `.autoclaw/hermes/` — research memos, `sources.json`, `pending/` / `approved/` / `preview/`. Committed Jekyll tree: `site/` (staged by `/hermes publish`). Deploy: Actions on branch `content`. Vector + KG stay local until OpenClaw Phase 7. Spec: [architecture-plan-phases.md](./architecture-plan-phases.md); contracts: [schemas/hermes-research.md](../schemas/hermes-research.md), [schemas/hermes-publish.md](../schemas/hermes-publish.md).

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Host AI Agent (any IDE/CLI)                  │
│              reads .agent/rules/*  →  executes slash-commands    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
   ┌───────────┐         ┌────────────┐         ┌────────────┐
   │ Orchestrate│         │  MAteam    │         │  KDream    │
   │ sprint DAG │         │ R→C→R→V   │         │ background │
   └─────┬─────┘         └─────┬──────┘         └─────┬──────┘
         │                     │                      │
         ▼                     ▼                      ▼
   ┌──────────────────────────────────────────────────────────┐
   │              Cross-Agent Protocol (JSON bus)             │
   │   inboxes/ · consensus/ · heartbeats/ · registry.json    │
   └───────────────────────────┬──────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
   ┌───────────┐         ┌──────────┐         ┌────────────┐
   │Intelligence│         │AutoBuild │         │ Security / │
   │ learn/RAG  │         │ workflows│         │ Doc Writer │
   └─────┬─────┘         └────┬─────┘         └─────┬──────┘
         │                    │                     │
         └────────────────────┼─────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │   .autoclaw/     │
                    │  (all durable    │
                    │   runtime state) │
                    └──────────────────┘
```

### 4.1 Control plane vs data plane

- **Enforced control plane**: the shared TypeScript kernel, SQLite WAL, worktree/lease manager, deterministic guard, and review ingestion.
- **Advisory compatibility plane**: slash-commands + rule files + legacy orchestrator files. These remain portable but cannot claim collision-free or evidence-gated execution unless they call the kernel.
- **Data plane**: vector DB, KG, learnings, MEMORY.md, mateam scratchpads, autobuild run logs.

Agents never need a network round-trip to coordinate. The console is localhost-only, and the file bus transports schema-versioned review requests and verdicts.

### 4.2 Two coordination modes

| Mode | When | Mechanism |
|---|---|---|
| **Sprint fleet** | Large parallel work across agents/tools | Orchestrate DAG + scope isolation + consensus bus |
| **In-session team** | Single-task depth (research → code → review → verify) | MAteam sequential roles + scratchpad |

Use Orchestrate for multi-agent parallelism across a repo; use MAteam for a disciplined single-task pipeline inside one host session.

---

## 5. Subsystem Contracts (Detailed Approach)

### 5.1 Orchestrate — Sprint DAG planner

**Purpose:** Turn a task manifest into conflict-free parallel work.

**Intake (soft gate, before manifest):** File-drop under `orchestrator/intake/` → `/orchestrate intake` → `ask` → `propose` (writes `plans/project-plan.md`) → human review → `/orchestrate approve` (generates `manifests/<slug>.yaml`). `/orchestrate plan` does not refuse when no approved plan exists.

**Algorithm (plan):**

1. **Parse & validate** — IDs unique, `depends_on` resolvable, scopes non-empty; optional `required_capabilities`.
2. **Build DAG** — Kahn’s algorithm; fail loud on cycles.
3. **Level assignment** — topological levels; same level ⇒ candidates for parallel execution.
4. **Scope conflict detection** — overlapping globs at the same level are split across sprints or ordered merges.
5. **Bin packing** — respect `max_tasks_per_agent`, effort, mutual exclusion, affinity; prefer critical-path and high-fanout tasks first.
6. **Capability-aware routing** (v2) —  
   `score(agent, task) = capability_match × trust_score × idle_factor / estimated_cost`  
   Fall back to round-robin if no positive score.
7. **Migration range allocation** — sequential non-overlapping DB migration ranges per agent when needed.
8. **Emit** — `sprint-N.yaml` + human-readable `sprint-N.md` + `plan-summary.yaml`.

**Assign:** dependency sprints must be `merged`; each agent gets an assignment brief and an optional **context pack** (code + learnings + style + memory + KG). Stalled heartbeats skip slots and emit a stalled sidecar.

**Lifecycle:** `pending → assigned → in_progress → review → approved → merged`.

**Invariant:** Scope isolation is sacred. Never assign overlapping file scopes to parallel agents in the same sprint.

### 5.2 Cross-Agent Protocol — File bus

**Purpose:** Shared mailbox so heterogeneous agents collaborate without a broker process.

**Paths:**

- `comms/inboxes/<agent-id>/` — directed mail
- `comms/inboxes/shared/` — broadcast
- `comms/consensus/active/` — open votes
- `comms/heartbeats/` — liveness
- `comms/registry.json` — agent metadata, keepalive templates, stall thresholds

**Message envelope (required fields):** `id`, `session_id`, `from`, `to`, `type`, `timestamp`, plus `payload`.  
`session_id` distinguishes concurrent windows of the same agent and supports idempotency.

**Filename:** `{timestamp}-{type}-{from}.json`

**Consensus:**

- Ordinary tasks: **2/3** majority (`approve` / `reject` / `request_changes`)
- Security findings: **unanimous**

**On task completion:** broadcast `task_complete` → send `review_request` to peers → drain own inbox before new work.

### 5.3 MAteam — Role pipeline

**Purpose:** Decompose one task into Researcher → Coder → Reviewer → Verifier.

**Dispatch:**

- Host has `Agent` tool → real subagents with self-contained prompts.
- Otherwise → same agent plays each role in order, writing handoffs to the scratchpad.

**Scratchpad:** `.autoclaw/mateam/scratch/<session>/`  
`plan.md`, `context.md`, `output.md`, `review.md`, `verify.md`

**Invariant:** One scratchpad per session ID; reuse without cancel is an error (append `-2`, etc.).

### 5.4 KDream — Persistent background agent

**Purpose:** Always-on workspace hygiene and memory consolidation without blocking interactive work.

**Tick cycle:**

1. Git status / stale uncommitted warnings  
2. TODO/FIXME/HACK/XXX/BUG scan + diff vs previous tick  
3. MEMORY.md follow-ups (`- [ ]` open, `- [x]` done)  
4. Notify only when actionable; otherwise silent heartbeat log  
5. Every 20 ticks or 24h → **autoDream**

**autoDream:** gather ~7 days of logs → consolidate Facts → dedupe → archive Observations if MEMORY.md exceeds ~200 lines. Facts carry `verified_by` provenance.

**Invariant:** Append to MEMORY.md; never overwrite. `start` is idempotent when `status == "running"`.

### 5.5 Intelligence — Learn & retrieve

**Purpose:** Distill kept-vs-discarded patterns from past AI sessions and serve grounded context back to agents.

**Core loop:** `/learn` → distill → learnings + agent-style + KG enrichment; `/index-code` → vector store; `/retrieve` / `/search` → read-only retrieval; `/rag-generate` / `/scaffold` → prompt construction.

**Consent:** third-party session sources opt-in via `/sources`; AutoClaw-native logs default on. Redact secrets/PII before embed/store/log.

**Config:** `.autoclaw/vector/config.json` (optional; validated defaults if absent).

**Phase 4 source adapters:** `.agent/rules/intelligence/sources.yaml` is the versioned registry for AutoClaw, Claude Code, Claude Desktop exports, Cursor, Kiro, and Gemini. Each adapter declares consent, discovery paths, format, kept/discarded signal, unsupported behavior, and confidence. Ingestion is read-only and incremental: it redacts before hashing or persistence, attributes records to a workspace, stores provenance and classification evidence, deduplicates by content fingerprint, and advances a source watermark only after an atomic successful write. Unknown classifications remain `unknown`; they are never promoted to “kept” by inference.

### 5.6 AutoBuild — Workflow engine

**Purpose:** Cron and one-shot build/test/deploy workflows with auditable run logs.

**Guarded fix mode:** steps may declare `mode: fix` with `guard.scope_globs`, `max_files`, `require_clean_git`, and `rollback_on: test_fail`.

**Scheduler health:** `scheduler-heartbeat.json` older than ~3× tick interval ⇒ treat scheduler as dormant; registered workflows will not fire.

**Invariant:** Prefer writing workflow files directly (parents created by write tool). `schedule` updates in place; empty steps park as `draft`.

### 5.7 Security Auditor & Doc Writer

**Security Auditor:** threat-model-driven review (network, local workspace reader, accidental disclosure). Emits structured findings and gates security-tier merges via unanimous consensus.

**Doc Writer:** keeps README/docs/CHANGELOG honest on public-API changes. Docs + CHANGELOG only; never “fix” docs to match a bug — emit `finding_report` instead. Never document unshipped capabilities as live.

---

## 6. On-Disk Contract

```
.autoclaw/                         # gitignored runtime root
  AGENT-ORIENTATION.md             # generated — do not hand-author
  agent-style.md                   # regenerated by /learn
  vector/                          # embeddings + index metadata
  kg/                              # coordination knowledge graph
  learnings/                       # distilled session insights
  metrics/                         # token / kept-rate metrics
  history/                         # per-source ingestion watermarks
  .locks/                          # advisory file locks
  kdream/
    state.json
    logs/YYYY-MM-DD.md
    memory/MEMORY.md               # append-only
  orchestrator/
    config.yaml
    intake/                        # user file-drop + INDEX.md
    plans/                         # project-plan.md, clarifications, status.yaml
    manifests/                     # input task YAMLs
    sprints/                       # sprint-N.yaml/.md, context packs
    reviews/ logs/ board.*
    comms/
      inboxes/<agent>/ + shared/
      consensus/active|resolved/
      heartbeats/
      registry.json
  mateam/scratch/<session>/
  autobuild/
    workflows/ registry.json runs/
    scheduler-heartbeat.json

.agent/rules/                      # host-agnostic executable specs
.claude/rules/                     # Claude-specific overlays
```

**Rule:** Generated orientation and style files refresh automatically. Manual copies become stale — always read from `.autoclaw/`.

**Check-in policy:** Do **not** commit `.autoclaw/` (including KDream). It is local runtime state, already covered by `.gitignore`. Specs and docs belong in git; agents recreate `.autoclaw/` via slash-commands. Full policy and purpose: [autoclaw-and-kdream.md](./autoclaw-and-kdream.md).

---

## 7. Agent Lifecycle (End-to-End)

```
1. /orchestrate init
2. Drop inputs in intake/ → /orchestrate intake → /orchestrate ask
3. /orchestrate propose       → plans/project-plan.md for human review
4. /orchestrate approve       → generate manifests/<slug>.yaml
   (soft gate: hand-authored manifests still allowed without approve)
5. /orchestrate plan          → DAG + scope-isolated sprints
6. /index-code + /learn       → grounded context for assignees
7. /kdream start              → background memory + TODO watch
8. /orchestrate assign N      → briefs + context packs + inbox task_assign
9. Agents work in scope; heartbeat; message peers as needed
10. task_complete + review_request → consensus (2/3 or unanimous)
11. /orchestrate review N      → quality gates
12. /orchestrate merge N      → land approved sprint
13. /orchestrate next         → advance critical path
    (revive stalled peers as needed)
```

Human checkpoints sit at project-plan approval, sprint review, consensus, and merge. The system is autonomous within gates, not unbound.

---

## 8. Extensibility Model

| Extension | How |
|---|---|
| New agent personality | Add `.agent/rules/<name>.md` with trigger, operating rules, on-disk paths |
| New workflow | Write `.autoclaw/autobuild/workflows/<name>.yaml` + registry entry |
| New peer agent | Register in orchestrator config + inbox dir + heartbeat + keepalive template |
| New learning source | Opt-in via `/sources` with redaction policy |
| Hosted scale-out | Optional later (OpenClaw / Postgres) — see BRAINSTORM.md |

Keep new surfaces **file-shaped** and **idempotent**. Prefer Markdown/YAML/JSON over binary protocols for anything a human might audit mid-flight.

---

## 9. Non-Goals (Current Phase)

- Requiring a always-running central server for basic multi-agent work  
- Replacing the host IDE’s agent runtime with a custom binary in this Markdown-first repo  
- Documenting unshipped TypeScript/MCP APIs as if they were present here  
- Blind overwrite of MEMORY.md, preferences, or consensus history  
- Parallel agents sharing the same write scope without an explicit merge order  

Hermes Phases 0–4 and 6 are implemented as agent-executable rules (profiles, ResearchHermes diff, approve/preview/publish + Jekyll Pages, BlogHermes, `/learn` source adapters, ThreadHermes, and ReportHermes). Remaining open product questions (issue sync, hosted migration, self-host DAG) live in [BRAINSTORM.md](../BRAINSTORM.md) — do not claim them as shipped until reflected in rules + README.

---

## 10. Verification Approach

Because this repository is **Markdown + agent rules** (no package manifest / test suite), “correctness” means:

1. Generated `.autoclaw/` trees match the contracts above.  
2. Sprint plans have valid DAG levels and **no overlapping scopes** among parallel agents.  
3. Messages carry `id` + `session_id`.  
4. Commands remain safe to re-run.  
5. Docs never claim Planned commands as Implemented.

When a TypeScript/extension runtime lands elsewhere, these file contracts remain the source of truth for interoperability.

---

## 11. Principle Checklist (for contributors & agents)

- [ ] State change belongs under `.autoclaw/` and is human-readable where practical  
- [ ] Command is idempotent and uses forward-slash paths via file tools  
- [ ] Parallel work respects scope isolation  
- [ ] Security path uses unanimous consensus; ordinary path uses 2/3  
- [ ] Vector vs KG vs MEMORY responsibilities are not mixed  
- [ ] Consent + redaction applied before ingesting third-party sessions  
- [ ] Docs match shipped behavior; open questions stay in BRAINSTORM.md  
- [ ] Cross-agent messages include `id`, `session_id`, `from`, `to`, `type`, `timestamp`  
