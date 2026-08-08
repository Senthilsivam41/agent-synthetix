# Example research memo (few-shot)

Illustrative shape only — not live runtime state.

```markdown
---
profile: research
date: 2026-08-07
slug: local-first-agent-memory
title: Local-first agent memory patterns
baseline: false
diff_mode: semantic
prior_date: 2026-08-06
sources:
  - https://example.com/memory-patterns
---

# Local-first agent memory patterns

## Summary
Teams keep durable agent memory in append-only Markdown plus a vector store for retrieval.

## Findings
- Append-only MEMORY.md survives tool switches.
- Embeddings enable semantic retrieval without a central server.

## Diff vs 2026-08-06
- [NEW] Embeddings enable semantic retrieval without a central server.
- [CHANGED] Append-only MEMORY.md survives tool switches. (was: notes files only)

## Sources
- https://example.com/memory-patterns — survey
```
