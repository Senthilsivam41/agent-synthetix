# Documentation

Canonical docs for **agent-synthetix** — a workspace-native, tool-agnostic agent control plane.

| Doc | Purpose |
|---|---|
| [How to run locally](./how-to-run.md) | Why `/orchestrate` fails in the terminal; how to run commands in agent chat |
| [Local Control Plane](./control-plane.md) | Kernel-managed headless workflow, review bus, runtime artifacts, and guard modes |
| [ADR 0001](./adr/0001-control-plane-execution-authority.md) | Accepted execution-authority and verified-completion decision |
| [Hermes Agent architecture proposal](./proposals/hermes-agent-integration-architecture.md) | To-be worker-adapter, event/evidence, A2A, and controlled-learning projection |
| [ADR 0002](./adr/0002-hermes-agent-as-governed-worker.md) | Proposed Hermes Agent worker boundary |
| [ADR 0003](./adr/0003-hermes-transport-and-runtime-isolation.md) | Proposed local-first transport and independent runtime lifecycle |
| [ADR 0004](./adr/0004-hermes-events-evidence-and-acceptance.md) | Proposed event, citation, and acceptance trust boundary |
| [ADR 0005](./adr/0005-hermes-learning-as-profile-proposals.md) | Proposed controlled handling of Hermes learning output |
| [Architecture Principles](./architecture-principles.md) | Design principles, subsystem contracts, coordination model, and detailed implementation approach |
| [Architecture plan (Hermes phases 0–7)](./architecture-plan-phases.md) | Build sequence: ResearchHermes → approve/Pages → Blog → `/learn` → issues → Thread/Report → OpenClaw |
| [Hermes vs OpenClaw layers](./hermes-vs-openclaw-layers.svg) | Profile (instructions) vs local worker vs hosted runner |
| [Hermes Pages site](../site/README.md) | Jekyll `site/` — approve → publish → `content` branch → Actions |
| [Hermes runtime runbook](./runbooks/hermes-runtime.md) | H0 compatibility inspection, isolated candidate preparation, activation, and rollback |
| [Hermes H0/H1 implementation plan](../tasks/plan-hermes-agent-integration.md) | Adapter contract, registration migration, capability freshness, and later gated phases |
| [Console accessibility audit](./ux/accessibility-audit-2026-08-11.md) | WCAG 2.2 AA implementation findings, automated evidence, and remaining manual checks |
| [Product Roadmap](./product-roadmap.md) | Market position, target users, phased delivery plan, gates, metrics, risks, and go-to-market sequence |
| [`.autoclaw` and KDream](./autoclaw-and-kdream.md) | Check-in policy (do not commit runtime state) and primary purpose of `.autoclaw/` / KDream |
| [UX — Orchestrate Control Console](./ux/README.md) | End-user UI/UX design specs (intake → approve → sprints); runtime in `console/` |
| [Project memory](../memory/README.md) | Current status, future backlog, agent Codegraph conventions |

| [../README.md](../README.md) | Product overview, command surface, quick start |
| [../BRAINSTORM.md](../BRAINSTORM.md) | Open design questions still undecided |
| [../AGENTS.md](../AGENTS.md) | Cursor Cloud / agent runtime notes for this repo |

## How to read these docs

1. Start with the [README](../README.md) for what the system does and how to invoke it.
2. Read [Architecture Principles](./architecture-principles.md) before extending subsystems, adding agents, or changing the on-disk contract.
3. Read the [Product Roadmap](./product-roadmap.md) for positioning, priorities, phase gates, and success measures.
4. Read [`.autoclaw` and KDream](./autoclaw-and-kdream.md) before committing anything under `.autoclaw/` — that tree is gitignored runtime state.
5. For human-facing Orchestrate UX, read [UX specs](./ux/README.md); Intake, Clarify, Plan Review, Approve, Sprints, and command activity ship in `console/`.
6. Check [BRAINSTORM.md](../BRAINSTORM.md) for unresolved product decisions — do not treat open items as shipped behavior.
7. Treat `.agent/rules/*.md` as the executable specification the host agent follows at runtime.
8. Treat proposed ADRs as implementation gates, not shipped behavior. Move them to Accepted only after their stated acceptance conditions are demonstrated.
