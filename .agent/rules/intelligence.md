> Local-first intelligence layer that learns from past AI coding sessions, does RAG over your codebase, and cuts token waste. Trigger on "learn from my sessions", "index my code", "retrieve context", "/learn", "/index-code", "/retrieve", or "intelligence layer".

# AutoClaw Intelligence — Learning & Retrieval Layer

A local-first "second brain" for AutoClaw. It ingests past AI coding sessions
from any tool (plus AutoClaw's own logs), distills what was kept vs. discarded,
indexes your real codebase, and serves that context back to cut token waste.

> **Status: core loop + Wave A + Phase 4 ingestion contracts implemented.** The module skeleton, configuration,
> on-disk contract, and packaging are in place. The four core-loop commands
> `/learn`, `/index-code`, `/retrieve`, and `/search` plus the Wave A commands
> `/sources`, `/rag-generate`, `/scaffold`, and `/metrics` are now **implemented**
> and wired into activation and the `@autoclaw` chat surface. Universal session
> ingestion (Claude Code, Claude Desktop exports, Cursor, Kiro CLI, Gemini CLI), git-validated kept
> signals, the metrics dashboard, and the pluggable Postgres/Ollama backends are
> live. The `/service` watch command arrives in a later phase. Do not claim a
> command ran when it is marked *Planned*; say it is not available yet.

## Operating Rules (read before any sub-command)

1. **Use file tools, not shell, for directories and files.** Create folders and
   files with the host's file/write tool (e.g. Write, create_file, edit_file). Do
   NOT use `mkdir -p`, `touch`, `New-Item`, or shell redirection — they fail
   across the Bash/PowerShell/cmd.exe mix you may be running on. If you must shell
   out, detect the platform first.
2. **Always use forward slashes in paths** (e.g. `.autoclaw/vector/config.json`).
   Node, git, and every supported shell accept them.
3. **Be idempotent.** Creating a contract directory that already exists is a
   no-op. Never overwrite `.autoclaw/kdream/memory/MEMORY.md` or
   `preferences.json` — append or merge only.
4. **Output discipline.** When confirming an action, output ≤3 short lines: what
   was done, current counts, next step. Do not narrate your reasoning, repeat
   headings, or invent style rules. No emojis unless the user asked.
5. **Never invent files, sessions, learnings, or metrics.** Only report what you
   actually read from disk. If a store is empty or a command is unimplemented,
   say so plainly.
6. **Local-only and consent-first.** Third-party session sources are opt-in;
   AutoClaw-native logs are on by default. Redact secrets/PII before embedding,
   storing, or logging.

## On Invocation

Determine the sub-command from the user's message and route to the matching
section. If the command is marked *Planned*, tell the user it is not implemented
yet and point to what foundation provides (config + on-disk contract).

## Command surface

| Command | Status | Purpose |
|---------|--------|---------|
| `/learn` | Implemented (Phase 4) | Sweep enabled sources, redact, classify kept/discarded/unknown with evidence, distill and dedupe learnings, advance watermarks only after durable writes, and enrich the KG. Args: `--source <id\|all>`, `--last N`, `--focus "area"`, `--session <id>`, and `--mark-kept` (manual-only sources). Output: discovered, accepted, deduplicated, unknown, and failed counts by source. |
| `/index-code` | Implemented (core-loop) | Chunk + embed the workspace codebase into the vector store. Args: `--force` (re-index everything, ignoring the last-index watermark). Output: files indexed and chunk count. |
| `/retrieve` | Implemented (core-loop) | Retrieve the most relevant code/learning chunks for a query. Usage: `/retrieve <query>`. Output: the top matching chunks with their source paths. |
| `/search` | Implemented (core-loop) | Semantic search over distilled learnings. Usage: `/search <query> [--limit N]` (cap results at N). Output: ranked learnings with scores. |
| `/sources` | Implemented (Phase 4) | List source format, availability, consent, configured locations, and enabled state. `/sources enable <id>` and `/sources disable <id>` update only `.autoclaw/vector/config.json`. Discovers AutoClaw, Claude Code, Claude Desktop exports, Cursor, Kiro CLI, and Gemini CLI from [`intelligence/sources.yaml`](./intelligence/sources.yaml). |
| `/scaffold` | Implemented (signal-and-rag) | Emit your learned `agent-style.md` (optionally `--focus "area"`) to prepend to a new agent task. Copied to the clipboard. |
| `/rag-generate` | Implemented (signal-and-rag) | Build a grounded RAG prompt for a task from retrieved code + learnings + style + memory. Degrades gracefully without a vector backend. Copied to the clipboard. |
| `/metrics` | Implemented (metrics-dashboard) | Show learning-run counts, kept-rate, and token usage (real vs estimated). A live dashboard view is available under the AutoClaw activity-bar container. |
| `/service` | Planned (automation-reach) | Run the continuous watch service that ingests new sessions as they land. |

## Knowledge Graph

Distinct from the vector stores above, the **Knowledge Graph** (`.autoclaw/kg/kg.db`)
holds agent- and task-attributed *facts* — decisions, findings, observations, and
learned patterns — connected by typed relations, with bi-temporal validity. It is
fed automatically by the orchestrator (dispatch/completion), `/learn` (consensus
decisions + mined workflow patterns + review findings), and the `kg.record` MCP
tool. Agents recall from it with the `kg.search` / `kg.traverse` MCP tools; humans
browse and visualize it (searchable list + force-directed graph) via the
**AutoClaw: Knowledge Graph — Browse & Visualize** command (`autoclaw.kg.browse`).

## Configuration

Single configuration surface at `.autoclaw/vector/config.json`. When absent, the
layer uses validated defaults without writing a file:

- `backend`: `sqlite-vec` (default) or `postgres`.
- `embedding`: provider `transformers` (default, `Xenova/nomic-embed-text-v1.5`,
  768-dim), `ollama`, or `none`. The `none` provider is the always-available
  degraded fallback that needs no native modules.
- `rag`, `search`, `tokenLogging`, and per-`sources` enablement.

Invalid fields fall back to their default with a warning rather than failing.

## Phase 4 source adapters

The canonical adapter registry is [`intelligence/sources.yaml`](./intelligence/sources.yaml). AutoClaw-native logs are enabled by default. Every third-party source is opt-in and remains disabled until `/sources enable <id>` records consent. Discovery expands `~`, resolves globs without following symlinks outside the declared root, and reports one of `available`, `unavailable`, `export_required`, or `unsupported_format`.

- **Claude Code:** read project-scoped JSONL under `~/.claude/projects/`. Treat tool output as secret-bearing until redacted.
- **Claude Desktop:** do not scrape Electron LevelDB, cache, IndexedDB, or session storage. Accept only a user-supplied Markdown/JSON export and require `--session`; kept status is manual.
- **Cursor:** open a copied SQLite snapshot read-only, require `ItemTable`, and inspect only the registered composer/AI keys. If keys or value shapes are unknown, report `unsupported_format`; never guess or mutate the live database.
- **Kiro:** ingest CLI/ACP JSONL under `~/.kiro/sessions/cli/`. Kiro IDE 1.x internal storage is not a supported parser; use a portable export until a versioned format is documented.
- **Gemini CLI:** ingest project-scoped JSONL under `~/.gemini/tmp/*/chats/`. Associate a session with a repository only when its recorded working directory resolves to that repository.

### `/learn` execution contract

1. Read enabled sources and their last `.autoclaw/history/<source>.json` watermark. `--source` cannot bypass consent.
2. Discover files, sort by modification time then stable path hash, and apply `--last` after filtering already-watermarked sessions.
3. Parse only the declared format with bounded record/file sizes. A malformed record becomes a per-session failure; it does not advance the watermark.
4. Normalize user requests, assistant decisions, file operations, checkpoints, and explicit accept/revert signals. Drop model reasoning and raw command output.
5. Redact credentials, headers, keys, cookies, tokens, email addresses, and obvious personal identifiers before classification, hashing, embedding, or logging.
6. Attribute a workspace only from an explicit source working directory or a verified repository path. Never infer one from similarly named text.
7. Classify repository-scoped work:
   - `kept`: changed paths appear in a commit made during/after the session, the current working-tree diff, or a native accepted checkpoint.
   - `discarded`: a native/explicit revert is present, or a session-created patch is demonstrably absent after rollback with matching path hashes.
   - `classification: unknown`: default when evidence cannot prove either outcome. Absence from the current diff alone is not proof of discard.
8. `--mark-kept` requires `--source`, `--session`, and a manual source. Record `classification_evidence.kind: manual` and `confidence: manual`; never upgrade it to verified.
9. Distill reusable behavior without transcript quotations, compute `content_fingerprint`, and skip an existing fingerprint.
10. Write the versioned [learning insight](../../schemas/learning-insight.md), merge `agent-style.md`/preferences, and record deduped KG facts. Atomically advance the watermark only after all writes succeed.

Output one row per source with `discovered`, `accepted`, `deduplicated`, `unknown`, `failed`, and `watermark_at`. A missing source is `unavailable`, not zero successful sessions.

## On-disk contract

The layer owns only paths under `.autoclaw/` and never collides with `.cursor/`,
`CLAUDE.md`, or other tools:

```
.autoclaw/vector/      config.json, db.sqlite, last-index.json
.autoclaw/learnings/   distilled learnings
.autoclaw/metrics/     token/usage metrics
.autoclaw/history/     per-source extraction watermarks
.autoclaw/.locks/      advisory file locks
.autoclaw/kdream/memory/MEMORY.md   owned by KDream — appended, never overwritten
```

Generated data (`db.sqlite`, `.locks/`, `history/`) is gitignored.

## Reuse, don't fork

This layer builds on existing AutoClaw subsystems rather than duplicating them:
`src/runners` for session discovery, `src/llm` (cost ledger) for token logging,
`src/memory` for memory records, `src/mcp` for retrieval exposure, and the
`autoclaw-kdream` activity-bar container for any UI. Learnings feed the KDream
dream pipeline.
