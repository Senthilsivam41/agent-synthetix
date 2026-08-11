---
schema_version: "1.0"
id: 2026-08-11-thread-collision-boundaries-x
profile: thread
title: "Collision boundaries before parallel agents"
date: 2026-08-11
slug: collision-boundaries-x
tags: [agents, coordination]
platform: x
thread_style: numbered
max_chars: 280
source_refs: [example:collision-boundaries]
approved: false
---

## Post 1/2

1/2 Parallel coding agents need a boundary before they need a smarter prompt. Give each execution an isolated worktree and an explicit write scope.

## Post 2/2

2/2 Then verify the resulting diff against that scope before review. Coordination becomes enforceable evidence, not an agent saying “done.”
