---
id: 2026-08-09-local-first-agent-memory
profile: blog
title: What changed in local-first agent memory
date: 2026-08-09
slug: local-first-agent-memory
tags: [memory, agents, research-diff]
approved: false
source_memo: .autoclaw/hermes/research/memos/2026-08-07/local-first-agent-memory.md
source_memo_date: 2026-08-07
prior_date: 2026-08-06
baseline_source: false
---

# What changed in local-first agent memory

I tracked yesterday's research memo against today's. Two shifts matter if you run agents across tools.

## What changed

Embeddings now carry retrieval for agent memory without standing up a central server — that is new since the prior memo. Append-only `MEMORY.md` still survives tool switches, but the framing moved: it is no longer "notes files only"; it is the durable spine beside the vector store.

## Why it matters

Local-first stacks stay portable when the narrative file and the embedding index share a clear split. I can swap hosts and keep both the prose trail and semantic recall. That matches how AutoClaw keeps Hermes instructions host-agnostic while state stays under `.autoclaw/`.

## Sources

- https://example.com/memory-patterns — survey
