# Implementation Plan: Live Task Dependency Graph

Companion to `docs/architecture-principles.md` §4.x. Sequenced to keep
every phase independently shippable and low-risk — no phase requires a
later phase to be correct in isolation.

---

## Phase 0 — Shared primitive extraction (prerequisite for everything else)

**Goal:** make `scopeMatch`/`scopesOverlap` a single source of truth
before any new consumer (read API, validator) is built on top of
possibly-inconsistent matching logic.

- [ ] Extract `scopeMatch`, `scopesOverlap`, `classifyPaths` from the
      current `filesOutsideScopes` implementation, **zero behavior
      change** — pure relocation.
- [ ] Add fixture-based contract tests against *existing* behavior
      (regression net) before anything new depends on it.
- [ ] Rewire `filesOutsideScopes` and lease-conflict checks (on `run`) to
      call the extracted functions.
- [ ] Add property-based test: random path/scope generation, assert every
      call site reaches the same `OverlapKind` classification.

**Exit criteria:** existing kernel test suite passes unchanged; new
contract tests pass; no behavioral diff in staging.

---

## Phase 1 — Read-only kernel API (`getLeaseStatus`, `getTaskState`)

**Goal:** expose live, race-free reads without granting DB access.

- [x] Define Ajv Draft 2020-12 schemas for both request/response pairs
      and the shared error envelope (`safe_to_proceed: false` always on
      non-success).
- [x] Implement handlers reading inside the kernel's existing
      `BEGIN IMMEDIATE` transaction boundary — no new transaction model.
- [x] Wire `conflict_risk` computation through the Phase 0 primitive.
- [x] Fail-closed test matrix: `KERNEL_UNREACHABLE`, `LOCK_HELD_TIMEOUT`,
      `SCHEMA_VERSION_MISMATCH`, `MALFORMED_REQUEST` — assert every path
      returns the same envelope shape.
- [x] Document as a versioned public contract (`api_version: "1.0"`) in
      `docs/control-plane.md`.

**Exit criteria:** advisory linter can query live lease/task state
end-to-end in a local dev cluster; no code path returns an ambiguous
"maybe safe" result.

---

## Phase 2 — Edge Log storage (single instance, no HA yet)

**Goal:** durable, schema-correct storage for `depends_on` edges, proven
before adding replica/failover complexity.

- [x] SQLite schema:
      `dependency_edges(from_task, to_task, added_by, added_at, removed_at, epoch)`.
- [x] Enforce ownership rule at the write layer: reject any write where
      `added_by` does not match the authenticated identity of `from_task`'s
      owning agent.
- [x] Implement OR-Set semantics: `INSERT OR IGNORE` for adds,
      soft-delete via `removed_at` (never physical delete) for
      observed-remove behavior.
- [x] Reverse-index query: given a task, return all live edges where it
      is the `to_task` (i.e., who depends on it) — this is what powers
      targeted notification in Phase 4.
- [x] Deploy as a single pod first — no StatefulSet, no PVC-follows-leader
      yet. Validate schema and query correctness in isolation.

Shipped as one Node process plus `.autoclaw/orchestrator/depgraph.db`.
Task ownership lives in that database (`task_owners`), not in
`control-plane.db`. The request `actor` is the authenticated identity;
`added_by` must match it and the owner of `from_task`. Every row is
stamped `epoch = 1` until Phase 5 fencing. An internal `add_tag` lets a
soft-deleted row remain beside a later add. Live edges are unique on
`(from_task, to_task)`. Cycle admission is still Phase 3: a successful
write means the edge was stored, not that it was checked for a cycle.

**Exit criteria:** edges can be added, soft-removed, and queried
correctly under concurrent writes from multiple test agents; reverse
index returns correct dependents.

---

## Phase 3 — Dependency Edge Validator (single instance, no HA yet)

**Goal:** prove component-scoped cycle prevention works correctly before
adding leader election on top.

- [ ] In-memory union-find structure, built from Edge Log's current
      accepted-edge set on startup.
- [ ] `wouldCreateCycle(proposedEdge)`: component-scoped reachability
      check per the design in §4.x.4 — confirm cost is proportional to
      local component size via a benchmark with clustered vs. sparse
      synthetic graphs.
- [ ] Accept path: atomic local step — check, merge union-find, append to
      Edge Log — as one indivisible critical section (single-threaded or
      locked) on this single instance.
- [ ] Reject path surfaces `CYCLE_DETECTED` as a structured response, not
      a bare error — consistent with the choreography principle that the
      requesting agent's own logic decides what to do next (retry
      narrower dependency, drop it, escalate).
- [ ] Startup/restart test: kill the process mid-run, restart, confirm it
      refuses new checks until index rebuild from the Edge Log completes.

**Exit criteria:** cycle attempts are correctly rejected; non-cyclic
concurrent writes succeed; restart-then-rebuild-before-serving is
verified under a forced crash test, not just at graceful shutdown.

---

## Phase 4 — Targeted notification

**Goal:** close the loop — when an agent adapts and writes back, its
declared dependents are notified without broadcast to everyone.

- [ ] On successful write-back to shared advisory state, query the Edge
      Log's reverse index for live dependents of the writing task.
- [ ] Deliver a lightweight, targeted signal (not payload-carrying — the
      notified agent still pulls the actual plan from shared state) to
      only those dependents.
- [ ] No new pub/sub broker — reuse the existing message bus /
      `.autoclaw` projection mechanism as the delivery surface.
- [ ] Instrument: log every notification with correlation IDs
      (originating task, notified task, edge epoch) for later staleness
      analysis.

**Exit criteria:** in a multi-agent integration test, only agents with a
declared `depends_on` edge receive a signal; unrelated agents do not.

---

## Phase 5 — HA: Kubernetes Lease election + fencing (both roles)

**Goal:** convert Phase 2 and Phase 3's single instances into
self-healing, independently-failing services.

- [ ] Validator: `coordination.k8s.io/v1` Lease named `depgraph-validator`,
      leader-only serving, fencing epoch stamped on every accepted-edge
      write.
- [ ] Edge Log: separate Lease named `depgraph-edgelog`, StatefulSet with
      PVC-follows-leader (`ReadWriteOnce`), same fencing discipline on
      writes.
- [ ] **Confirm the two Leases are never combined** — chaos test: kill
      the validator leader only, assert Edge Log leadership and PVC
      mount are undisturbed, and vice versa.
- [ ] Failover chaos tests:
      - Kill validator leader mid-check → new leader rejects checks until
        rebuild completes → no cycle wrongly admitted during the gap.
      - Kill Edge Log leader mid-write → PVC reattaches to new leader →
        no data loss (WAL durability) → epoch fencing rejects any
        delayed write from the old leader if it resumes.
- [ ] Load test component-scoped cycle check cost under realistic
      cluster-size distributions; add telemetry on component size to
      catch the "clusters turn out not to stay small" risk called out in
      the architecture doc.

**Exit criteria:** both roles survive pod deletion (`kubectl delete pod`)
with correct fail-closed behavior during the gap and no split-brain
writes (verified via epoch audit on the accepted-edge log).

---

## Phase 6 — Documentation and positioning alignment

- [ ] Merge `docs/architecture/dependency-graph-section.md` into
      `docs/architecture-principles.md` as §4.x.
- [ ] Update `AGENTS.md` if it references the advisory/enforced split, to
      confirm the dependency graph subsystem is called out as advisory.
- [ ] Add "known limitation" note: path bypass (agents can still write
      outside the kernel-managed path entirely) is unaffected by this
      subsystem — dependency notification only helps agents that
      voluntarily participate.
- [ ] Update metrics framework: add dependency-edge acceptance/rejection
      rate and notification delivery latency as observability signals
      (not gating metrics yet — instrumentation first, thresholds later).

---

## Cross-cutting: what NOT to do at any phase

- Do not let `depends_on` writes go through the kernel's `WorkspaceLock`
  or `control-plane.db` — this subsystem stays advisory-plane only.
- Do not let the validator or Edge Log share a single Lease object.
- Do not treat any fail-closed response (`NO_LEADER`, `INDEX_REBUILDING`,
  `KERNEL_UNREACHABLE`, `STALE_EPOCH`) as "probably fine" anywhere in
  calling code — every one of these must produce the same abstain
  behavior in the caller.
- Do not claim in public-facing copy that dependency notification is
  "guaranteed" — it is best-effort, targeted, and only as good as the
  edges agents choose to declare.
