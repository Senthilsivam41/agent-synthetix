## §4.x Live Task Dependency Graph (`depends_on`)

> Status: design accepted, not yet implemented. This section extends the
> dual-plane model defined in §4.1 — read that section first. Everything
> below lives entirely on the **advisory compatibility plane**. Nothing
> here alters, extends, or is covered by the ControlPlaneKernel's
> collision-prevention or evidence-gated completion claims.

### 4.x.1 Problem statement

When a kernel-managed execution hits `LEASE_CONFLICT`, the affected agent
adapts its plan locally (narrows scope, reorders work, yields) and writes
the adapted plan back to shared advisory state. Other agents whose tasks
are logically related need a way to learn about that adaptation without:

- polling shared state blindly (silent staleness — no guarantee anyone
  ever notices in time), or
- broadcasting every write to every agent (negotiation storms, no
  relevance filter, infrastructure cost disproportionate to the problem).

The resolution is a **live, agent-updatable `depends_on` field per task**,
used to route targeted notifications only to agents that declared a real
interest.

### 4.x.2 Why this is not a pure CRDT problem

Task dependency edges are naturally add-heavy, rarely-removed, and
tolerant of concurrent, uncoordinated writes — an OR-Set (observed-remove
set) CRDT is the correct storage/merge model for edge data at rest.

However, the *acceptance* of a new edge is not: **DAG acyclicity requires
a global-enough pre-write check** ("does adding this edge create a
cycle?"), which is inherently pessimistic. Two agents each proposing an
individually-acyclic edge can jointly create a cycle if neither sees the
other's in-flight write. This is the same TOCTOU race the kernel's lease
system exists to close for source files, recurring one layer up.

**Resolution: optimistic storage, pessimistic admission.**

| Concern | Model | Where |
|---|---|---|
| Edge storage / replication | OR-Set CRDT semantics (idempotent add, observed-remove) | Edge Log (SQLite, advisory plane) |
| Edge acceptance (cycle prevention) | Pessimistic, single-decider-at-a-time | Dependency Edge Validator |
| Notification routing | Reverse-index lookup on live edges | Edge Log leader |

### 4.x.3 Ownership rule

An agent may only write `depends_on` edges where **it is the dependent**.
An agent can never declare that another task depends on it. This
partitions writes by task ownership (no two agents ever contend to write
the *same* edge) and prevents an agent from fabricating obligations on
tasks it doesn't own.

### 4.x.4 Dependency Edge Validator

A narrow, purpose-built admission gate — **not part of the
ControlPlaneKernel** — that agents call synchronously before an edge is
considered accepted.

- **Cycle check is component-scoped, not global.** Reachability is
  checked only within the connected component containing the proposed
  edge's target. If the proposed `from` task isn't in that component, the
  edge is trivially acyclic (first connection between components can
  never itself close a cycle). This keeps check cost proportional to
  local cluster size, not total task count.
- **In-memory union-find index**, owned by whichever pod currently holds
  the validator leader role. The index is a **disposable cache**, never
  itself replicated — only the accepted-edge log is durable. On leader
  acquisition (first boot or failover), the validator **must rebuild its
  union-find index from the full accepted-edge log before serving any
  new checks.**
- **Single active decider, enforced by Kubernetes Lease election**
  (`coordination.k8s.io/v1`), separate `Lease` object from the Edge Log's
  (§4.x.6 — independent failure domains, not coupled).
- **Fencing epochs**: every lease acquisition increments a monotonic
  epoch. Every accepted-edge write carries the epoch of the leader that
  accepted it. The durable store rejects writes from a stale epoch, which
  protects against a leader that has lost its lease (e.g. due to a GC
  pause or network partition) but has not yet noticed and attempts to
  keep acting as leader.

#### Fail-closed contract

| Condition | Response | Caller obligation |
|---|---|---|
| No pod currently holds the validator lease | `NO_LEADER` | Retry with backoff — never treat as "no cycle" |
| Leader holds lease but index not yet rebuilt post-failover | `INDEX_REBUILDING` | Retry — never accept during rebuild |
| Write attempted with a stale epoch | `STALE_EPOCH` | Old leader self-demotes; caller should not normally observe this directly |

`safe_to_proceed` is never `true` on any non-success path. Every rejected
path returns the same error envelope shape so callers implement one
fallback branch, not several degrees of "probably fine."

### 4.x.5 Read API: `getLeaseStatus` / `getTaskState`

Two narrow, versioned, read-only RPCs exposed on the kernel's existing
CLI/API surface, added specifically so the advisory-plane linter and
other tooling can query **live** kernel state without a DB handle, a
schema dependency, or write capability.

```
getLeaseStatus(query_scopes: string[]) -> { scope, leased, lease_owner, conflict_risk }[]
getTaskState(task_ids: string[]) -> { task_id, found, state, terminal, evidence_gated }[]
```

- Backed by a live `BEGIN IMMEDIATE`-consistent read — not a cached
  projection — closing the staleness window a `.autoclaw/*.yaml` export
  would otherwise leave open for pre-flight collision checks.
- `conflict_risk` (`none | exact | ancestor | descendant | partial`) is
  computed via the **shared `scopeMatch` / `scopesOverlap` primitive**
  (§4.x.7) — the same function used by `filesOutsideScopes` and lease
  conflict checks on `run`. This is a correctness requirement, not a
  refactor of convenience: two independent implementations of "does path
  A overlap scope B" is exactly the kind of drift that stays invisible in
  unit tests and only surfaces as a real collision in production.

### 4.x.6 Edge Log storage and HA

- Backed by SQLite WAL, schema enforces OR-Set semantics via ordinary
  columns (`added_by`, `added_at`, `removed_at` soft-delete, `epoch`
  fencing token) — no distributed replication engine required.
- **Separate PVC from `control-plane.db`.** A storage or I/O failure on
  the Edge Log's volume has zero blast radius on the kernel's database,
  and vice versa.
- **HA via PVC-follows-leader**: StatefulSet + Kubernetes Lease election,
  same pattern as the validator, but its **own, independent Lease
  object**. On leader loss, the standby acquires the lease and the PVC
  detaches/reattaches per standard `ReadWriteOnce` StatefulSet failover.
- **Validator and Edge Log leases are deliberately independent** — a
  validator-only failure does not force Edge Log failover, and vice
  versa. Coupling them would create a shared failure domain with no
  underlying dependency to justify it.

### 4.x.7 Shared scope-matching primitive

```
scopeMatch(candidatePath: string, scope: string): OverlapKind
scopesOverlap(scopeA: string, scopeB: string): OverlapKind
classifyPaths(paths: string[], scopes: string[]): Map<string, OverlapKind>
```

`OverlapKind = "none" | "exact" | "ancestor" | "descendant" | "partial"`

Single source of truth for all overlap classification. `filesOutsideScopes`,
lease-conflict checks on `run`, and `getLeaseStatus` all call this — none
reimplement matching logic independently. A CI contract test
(property-based: random path/scope fixtures) asserts all call sites agree
on every input, making the "read API cannot drift from write-path
enforcement" claim provable, not just documented.

### 4.x.8 Explicit plane boundary for this subsystem

| Never claim | Because |
|---|---|
| "The kernel guarantees dependent agents are notified" | Dependency accuracy relies on agents declaring real relationships; the kernel/validator can only guarantee *structural* acyclicity, not *semantic* correctness of the graph |
| "`depends_on` participates in collision prevention" | It is a planning-quality signal on the advisory plane, not a kernel-enforced authority |

Cycle detection stops at "no cycle can exist in the accepted-edge graph."
It says nothing about whether a given edge is a *meaningful* dependency —
that judgment stays with the agent that declared it, consistent with the
choreography principle that resolution logic belongs in agent-specific
task reasoning, not in a static central rules engine.
