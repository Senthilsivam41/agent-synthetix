# Documentation

Canonical docs for **agent-synthetix** — a workspace-native, tool-agnostic agent control plane.

| Doc | Purpose |
|---|---|
| [How to run locally](./how-to-run.md) | Why `/orchestrate` fails in the terminal; how to run commands in agent chat |
| [Local Control Plane](./control-plane.md) | Kernel-managed headless workflow, review bus, runtime artifacts, and guard modes |
| [ADR 0001](./adr/0001-control-plane-execution-authority.md) | Accepted execution-authority and verified-completion decision |
| [Architecture Principles](./architecture-principles.md) | Design principles, subsystem contracts, coordination model, and detailed implementation approach |
| [Architecture plan (Hermes phases 0–7)](./architecture-plan-phases.md) | Build sequence: ResearchHermes → approve/Pages → Blog → `/learn` → issues → Thread/Report → OpenClaw |
| [Hermes vs OpenClaw layers](./hermes-vs-openclaw-layers.svg) | Profile (instructions) vs local worker vs hosted runner |
| [Hermes Pages site](../site/README.md) | Jekyll `site/` — approve → publish → `content` branch → Actions |
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
