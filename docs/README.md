# Documentation

Canonical docs for **agent-synthetix** (AutoClaw) — a file-native, tool-agnostic multi-agent AI operating system.

| Doc | Purpose |
|---|---|
| [Architecture Principles](./architecture-principles.md) | Design principles, subsystem contracts, coordination model, and detailed implementation approach |
| [`.autoclaw` and KDream](./autoclaw-and-kdream.md) | Check-in policy (do not commit runtime state) and primary purpose of `.autoclaw/` / KDream |
| [../README.md](../README.md) | Product overview, command surface, quick start |
| [../BRAINSTORM.md](../BRAINSTORM.md) | Open design questions still undecided |
| [../AGENTS.md](../AGENTS.md) | Cursor Cloud / agent runtime notes for this repo |

## How to read these docs

1. Start with the [README](../README.md) for what the system does and how to invoke it.
2. Read [Architecture Principles](./architecture-principles.md) before extending subsystems, adding agents, or changing the on-disk contract.
3. Read [`.autoclaw` and KDream](./autoclaw-and-kdream.md) before committing anything under `.autoclaw/` — that tree is gitignored runtime state.
4. Check [BRAINSTORM.md](../BRAINSTORM.md) for unresolved product decisions — do not treat open items as shipped behavior.
5. Treat `.agent/rules/*.md` as the executable specification the host agent follows at runtime.
