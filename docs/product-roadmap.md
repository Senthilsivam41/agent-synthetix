# Product Roadmap — Workspace-Native Agent Control Plane

**Product:** agent-synthetix (AutoClaw)

**Updated:** 2026-08-01

**Status:** Proposed strategy for validation; implementation phases are gated

**Planning horizon:** Foundation → verified orchestration → governed improvement

## 1. Executive summary

agent-synthetix will be positioned as the **workspace-native control plane for heterogeneous coding-agent fleets**.

It will not compete directly with model providers, agent SDKs, general workflow builders, or individual coding agents. Instead, it will coordinate agents from those ecosystems inside a software workspace through open, local-first contracts.

> **Coordinate every coding agent. Verify every result. Improve only from evidence.**

The roadmap follows this sequence:

```text
0. Product baseline and execution authority
        ↓
1. Agent contracts and trustworthy telemetry
        ↓
2. Dual-router adapter vertical slice
        ↓
3. Deterministic contract guard
        ↓
4. Bounded coalitions
        ↓
5. Controlled profile evolution
        ↓
6. Hard budgets
        ↓
7. Optional economy experiment
```

The first commercially meaningful milestone is **verified heterogeneous-agent orchestration**. Controlled evolution is a later, evidence-gated capability. An internal economy is an optional experiment, not a committed destination.

## 2. Product vision

Software teams should be able to use the best agent for each task without surrendering control of coordination state, source context, or improvement history to one agent vendor.

agent-synthetix will treat agents as a fleet whose members are:

- Discoverable by capability
- Assignable through a common contract
- Isolated by read/write scope
- Observable through replayable events
- Verifiable through independent evidence
- Comparable by task-specific outcomes
- Improvable through versioned, reversible profile changes

The long-term product is not merely an orchestrator. It is a portable evidence layer that can show which agent configuration works for which task family, under which constraints, and why.

## 3. Category and positioning

### 3.1 Category

**Open Agent Control Plane for Software Workspaces**

“Multi-agent operating system” remains the architectural vision. “Agent control plane” is the market-facing category because it maps to concrete buyer expectations: registration, routing, policy, evidence, verification, recovery, and governance.

### 3.2 Positioning statement

> For software teams using multiple AI coding agents across IDEs, CLIs, and model providers, agent-synthetix is a workspace-native control plane that plans work, prevents scope collisions, preserves shared state, independently verifies results, and improves agent strategies from evidence. Unlike vendor-specific runtimes and cloud workflow platforms, it coordinates the agents that teams already use through open, auditable, local-first contracts.

### 3.3 Core messaging

| Pillar | Customer promise | Product proof required |
|---|---|---|
| Bring existing agents | Keep the agents; standardize how they collaborate | Versioned adapters and canonical contracts |
| Workspace-native control | Coordination remains inspectable and portable | Local-first state, documented stores, export/replay |
| Collision-free parallel work | Parallel agents do not become parallel conflicts | Scope ownership, leases, conflict detection |
| Evidence-gated completion | A task is not complete because an agent says so | Independent verification and provenance |
| Governed evolution | Improve profiles without silent behavioral drift | Shadow evaluation, canaries, promotion, rollback |

### 3.4 Claims by maturity

| Maturity | Permitted positioning |
|---|---|
| Current | Open-source research preview for workspace-native multi-agent coordination |
| Developer preview | Verified heterogeneous-agent orchestration |
| Validated optimization | Evidence-gated agent optimization platform |
| Enterprise-ready, only after controls ship | Governed cross-provider agent operations |

Until the corresponding controls are implemented and validated, do not claim enterprise governance, enforced sandbox isolation, crash-proof orchestration, production-grade self-improvement, or proven cost optimization.

## 4. Market context

agent-synthetix sits above or alongside existing market layers rather than replacing them.

| Market layer | Representative leaders | Their center of gravity | AutoClaw relationship |
|---|---|---|---|
| Agent runtimes | OpenAI, Microsoft, Google | Models, SDKs, tools, sandboxes, deployment | Integrate their agents through adapters |
| Agent workflow frameworks | LangGraph, CrewAI | Graph/crew execution, persistence, tracing | Treat their workflows as fleet participants |
| Business automation | UiPath, n8n, Salesforce | Connectors, enterprise processes, governance | Stay focused on software workspaces |
| Persistent agent memory | Letta | Stateful agents and self-editing memory | Govern team-level routing and improvement |
| Coding-agent execution | Codex, Claude Code, GitHub Copilot, Cursor | Task and code execution | Coordinate them as workers |
| Durable execution | Temporal and managed workflow engines | Crash recovery and long-running workflows | Remain compatible; optionally use as a backend |

### 4.1 Competitive boundaries

agent-synthetix should not compete on:

- Foundation models
- General agent SDK ergonomics
- Hosted sandbox inventory
- General-purpose business connectors
- CRM-native automation
- General durable workflow execution
- Individual-agent memory alone

It should differentiate on:

- Neutral coordination across heterogeneous coding agents
- Repository/workspace scope ownership
- Open assignment, evidence, and profile contracts
- Local-first operational state
- Capability-specific performance evidence
- Controlled, reversible agent-profile evolution

## 5. Target customers and jobs

### 5.1 Initial ideal customer profile

The initial beachhead hypothesis is AI-native software teams that:

- Have approximately 3–30 engineers
- Already use two or more coding-agent products
- Experiment with parallel or asynchronous agent work
- Experience duplicated work, conflicting edits, context loss, or inconsistent quality
- Prefer open-source and local-first developer infrastructure
- Need traceability but are not yet buying a large enterprise automation suite

Priority users include developer-platform teams, AI tooling startups, open-source maintainers, consultancies, and security-conscious engineering groups.

### 5.2 Primary job to be done

> When several coding agents work on the same product, help me divide work safely, preserve shared context, and verify the combined result so I do not have to manually supervise every agent session.

### 5.3 Secondary jobs

> When different agent tools produce inconsistent quality, help me compare verified performance and route future work to the best agent for that task.

> When agent strategies change over time, help me evaluate, promote, and roll back those changes without silently degrading safety or quality.

### 5.4 Initial non-targets

- Nontechnical business-automation buyers
- Individual developers using only one agent
- Buyers primarily seeking a chatbot
- Customers requiring a managed cloud runtime today
- Regulated enterprise buyers expecting current SSO, RBAC, and compliance certification
- Teams expecting autonomous production deployment without human gates

## 6. Product principles

Every roadmap phase must preserve these invariants:

1. **Local-first by default.** Hosted services may extend the product but are not prerequisites for core coordination.
2. **Open contracts.** Agent identity, assignment, events, evidence, and outcomes use documented, versioned schemas.
3. **Independent verification.** Agent self-reporting cannot establish success by itself.
4. **Scope isolation.** Parallel agents never hold overlapping write scopes without an explicit ordered handoff.
5. **Idempotent transitions.** Retrying an operation cannot duplicate or corrupt state.
6. **Freshness is explicit.** Stale assignments, heartbeats, reconciliations, and evaluations are visibly invalid or degraded.
7. **Improvement is reversible.** Profile changes are versioned, evaluated, promoted, and rollback-capable.
8. **Safety cannot be purchased.** Budgets or future credits never bypass scope, verification, or approval rules.
9. **Stores remain separate.** CodeGraph, vector retrieval, coordination KG, committed project memory, and KDream runtime memory retain distinct responsibilities.
10. **Claims follow evidence.** Documentation must not present planned behavior as shipped.

## 7. Roadmap overview

| Phase | Outcome | Status | Dependency |
|---|---|---|---|
| 0 | Product baseline and authoritative execution model | Next | Current architecture |
| 1 | Canonical contracts and trustworthy execution evidence | Planned | Phase 0 |
| 2 | Dual-router completes and verifies a real task through AutoClaw | Planned | Phase 1 |
| 3 | Invalid, stale, or unsafe transitions are blocked | Planned | Phases 1–2 |
| 4 | Temporary multi-agent coalitions work within strict boundaries | Conditional | Phase 3 |
| 5 | Agent profiles improve through controlled evaluation | Conditional | Phases 1–4 plus sufficient data |
| 6 | Resource use is bounded predictably | Conditional | Trustworthy telemetry and guard |
| 7 | Bidding outperforms simpler routing in simulation | Experimental | Phase 6 plus demonstrated contention |

## 8. Phase 0 — Product baseline and execution authority

### Outcome

Define the measurable customer problem and one authoritative mechanism for operational state transitions.

### Key decision

Adopt a hybrid execution model:

| Layer | Responsibility |
|---|---|
| Host AI agent | Reasoning, planning, implementation, review |
| Local deterministic kernel | Identity, leases, schema validation, events, state transitions |
| Console | Human view and control surface |
| `.agent/rules/` | Executable behavior specifications and host guidance |
| `.autoclaw/` | Gitignored runtime state |

The local kernel need not be a mandatory cloud service or an always-running daemon. It exists to prevent cognitive agents from being the sole authority for mechanical state integrity.

### Deliverables

- Architecture decision record for execution authority
- Definition of verified completion
- Five to ten representative benchmark tasks
- Baseline measurements for current orchestration
- Freshness and lease policy
- State recovery scenarios
- Corrected documentation and runtime-state inconsistencies
- Test/conformance strategy for the console and contracts

### Exit criteria

- One component is authoritative for each state transition.
- A representative task can be followed from assignment to verified outcome.
- Stale state is detected and clearly surfaced.
- Existing smoke-test state can be reconciled or migrated.
- Baseline human intervention and task-success measurements exist.

## 9. Phase 1 — Agent contracts and trustworthy telemetry

### Outcome

Every assignment and result becomes attributable, replayable, comparable, and independently verifiable.

### Required contracts

- Agent profile
- Agent session and lease
- Task assignment
- Execution event
- Artifact manifest
- Verification evidence
- Execution outcome
- Capability-specific trust summary

Committed schemas should live under `schemas/` or another version-controlled contract directory. Generated profiles and execution records belong under `.autoclaw/`.

### Persistence model

Avoid relying on concurrent append-only JSONL writes as the only source of truth. Prefer atomic one-event-per-file ingestion, SQLite WAL, or a single local writer. Derived JSONL archives may remain useful for inspection and export.

### Trust model

Trust is capability-specific and evidence-derived. Success in documentation work must not automatically grant trust for migrations, security changes, or deployment.

Unknown cost or token data must be recorded as unknown rather than zero.

### Exit criteria

- Event replay derives the same final execution state.
- Interrupted writes do not corrupt accepted state.
- Expired sessions cannot submit accepted events.
- Success without verifier evidence is rejected.
- Out-of-scope changes are detected from the resulting diff.
- Legacy manifests continue through documented defaults or migrations.

## 10. Phase 2 — Dual-router adapter vertical slice

### Outcome

The completed dual-LLM router operates as one first-class AutoClaw agent without duplicating its planner/executor internals.

### Vertical slice

```text
Manifest task
  → canonical assignment
  → dual-router adapter
  → planner/executor run
  → artifacts and normalized result
  → independent verification
  → review and outcome
  → status/console
```

### Adapter requirements

- Versioned request and result contracts
- Capability and health discovery
- Idempotency key
- Start, status, cancel, timeout, and resume where supported
- Artifact manifest
- Planner and executor version identifiers
- Normalized error classification
- Token/cost reporting when available
- Workspace inspection after timeout or partial failure

### Validation experiment

Run matched tasks through the existing host-agent path and the dual-router path. Compare verified success, human repair, attempts, completion time, evidence quality, and cost where observable.

### Exit criteria

- Representative low- and medium-risk tasks complete reliably.
- Partial failure and timeout do not lead to unsafe duplicate execution.
- Adapter version mismatch fails explicitly.
- The adapter improves at least one important outcome without unacceptable guardrail regression.
- The dual-router remains replaceable through the common adapter contract.

## 11. Phase 3 — Deterministic contract guard

### Outcome

Invalid, stale, contradictory, or unsafe coordination state cannot silently affect work.

### Guard layers

1. Schema validation
2. Identity and session validation
3. Freshness validation
4. State-machine validation
5. Scope and lease validation
6. Evidence completeness
7. Consensus integrity
8. Budget enforcement when budgets exist
9. Semantic/adversarial review for ambiguous cases

Basic correctness must be deterministic. LLM reviewers should handle semantic ambiguity, not missing IDs or illegal transitions.

### Rollout

```text
report only → warnings → block high severity → block all invalid transitions
```

### Exit criteria

- Stale reports cannot override newer events.
- Duplicate event IDs and consensus votes are rejected.
- Scope collisions block activation or assignment.
- Fabricated completion without relevant evidence is rejected.
- Existing malformed fixtures produce expected findings.
- Guard failures default safely and remain visible to the user.

## 12. Phase 4 — Bounded coalitions

### Outcome

Temporary teams improve tasks that genuinely require multiple specializations without weakening scope ownership.

### Initial limits

- Maximum three agents
- One level of subcontracting
- Fixed TTL
- One leader/coordinator
- One explicit deliverable per member
- No nested coalitions
- No overlapping parallel write scopes
- Automatic dissolution and lease release

### Initial use cases

- Research → implementation → independent verification
- Frontend and backend work with an explicit interface handoff
- Implementation followed by security review

### Exit criteria

- Coalition activation is impossible with overlapping write scopes.
- Member failure or expiry releases claims.
- A user can see why the coalition exists, who owns each output, and what blocks it.
- Quality improvement exceeds coordination overhead on matched tasks.
- Coalitions dissolve reliably after completion, cancellation, or expiry.

## 13. Phase 5 — Controlled profile evolution

### Outcome

Agent strategies improve through comparable evidence while protected policies remain immutable.

### Lifecycle

```text
draft → validated → shadow → canary → eligible → promoted → active → retired
                                  └──────── regression → rolled back
```

### Evolvable fields

- Strategy prompts
- Few-shot examples
- Tool-selection policy
- Planning depth
- Retry strategy
- Context-selection weights

### Protected fields

- Scope enforcement
- Safety and approval policy
- Credential handling
- Audit requirements
- Contract-guard behavior
- Profile promotion policy

### Evaluation requirements

Evaluation must be organized by task family, such as TypeScript features, documentation, security review, bug diagnosis, and task planning. Aggregate success across unrelated work is not sufficient evidence.

Hard safety constraints take precedence over weighted fitness:

1. No critical safety regression
2. No increase in scope violations
3. No material reduction in verified completion
4. Only then optimize cost, latency, or novelty

### Exit criteria

- Active and candidate profiles are immutable versions.
- Shadow and canary runs use matched task families.
- Promotion is reproducible from stored evidence.
- Protected policy fields cannot mutate.
- Canary regression triggers a proven rollback path.
- Initial promotions require human approval.

## 14. Phase 6 — Hard budgets

### Outcome

Resource use becomes predictable before any market-like allocation mechanism is introduced.

### Controls

- Maximum attempts
- Execution timeout
- Model/tool-call ceiling
- Per-task cost ceiling
- Per-sprint aggregate ceiling
- Concurrency limit
- Coalition member and subcontract limits
- Conservative behavior when cost is unknown

### Exit criteria

- Budget exhaustion pauses or terminates work safely.
- Cancelled work releases unused reservations.
- Reservations are idempotent.
- Users can understand why execution stopped.
- Budgets cannot bypass verification, consensus, or safety policy.

## 15. Phase 7 — Optional economy experiment

### Outcome

Determine whether a market allocation mechanism materially outperforms capability/trust scheduling.

### Preconditions

Do not begin unless:

- Multiple qualified agents regularly compete for the same task family.
- Material resource contention exists.
- Cost and outcome telemetry are reliable.
- Capability-specific trust has sufficient evidence.
- Hard budgets are stable.
- Baseline routing performance is known.

### Experiment

Run bidding in simulation before it controls real assignments. Compare verified completion, cost, latency, allocation fairness, failure concentration, and gaming indicators against the simpler router.

### Exit criteria

- Simulated bidding materially outperforms capability/trust routing.
- Underestimation, task splitting, collusion, and self-review are detected.
- Disabling bidding leaves ordinary orchestration unaffected.
- Credits cannot purchase policy exceptions.

If these criteria are not met, the product remains on hard budgets and evidence-based routing.

## 16. Prioritization

Qualitative RICE assessment:

| Capability | Reach | Impact | Confidence | Effort | Priority |
|---|---:|---:|---:|---:|---:|
| Execution authority and stale-state handling | High | Very high | High | Medium | 1 |
| Contracts and independent telemetry | High | Very high | High | Medium-high | 2 |
| Dual-router vertical slice | High | High | Medium-high | Medium | 3 |
| Deterministic guard | High | Very high | High | Medium | 4 |
| Bounded coalitions | Medium | High | Medium | High | 5 |
| Controlled profile evolution | Medium | Potentially high | Low-medium | Very high | 6 |
| Hard budgets | Medium-high | Medium-high | High | Medium | 7 |
| Internal economy | Low initially | Unproven | Low | Very high | 8 |

## 17. Success metrics

### 17.1 North Star

**Weekly verified agent tasks completed without human repair**

```text
verified tasks requiring no human repair
────────────────────────────────────────
all tasks assigned through AutoClaw
```

### 17.2 Activation

A workspace is activated when it:

1. Registers at least two agents.
2. Generates one scoped sprint.
3. Completes one independently verified task.
4. Successfully resumes or reconciles state after interruption.

### 17.3 Leading indicators

- Time to first verified task
- Percentage of assignments with complete evidence
- Percentage of workspaces connecting a second agent
- Scope conflicts prevented
- Human intervention and repair rate
- Weekly active orchestrated workspaces
- Adapter reuse
- Profile comparison runs

### 17.4 Guardrails

- Out-of-scope modification rate
- False acceptance rate
- Decisions based on stale state
- Failed recovery rate
- Unexpected cost overruns
- Profile rollback rate
- Human approval bypasses

## 18. Go-to-market roadmap

### Stage 1 — Open-source credibility

Demonstrate three different coding agents receiving a real repository task, working in isolated scopes, exchanging evidence, undergoing review, and producing one verified result.

Required assets:

- Five-minute demonstration
- Example repository and reproducible task
- Before/after collision scenario
- Dual-router adapter
- Public contract schemas
- Failure and recovery demonstration

### Stage 2 — Integration ecosystem

Prioritize adapters for:

- Dual-LLM Router
- OpenAI Agents SDK/Codex
- Claude Code
- GitHub Copilot
- Google ADK/A2A
- LangGraph or CrewAI

### Stage 3 — Performance intelligence

Add agent scorecards, task-family comparisons, profile-version comparisons, failure clustering, and cost per verified completion.

### Stage 4 — Governed improvement

Ship shadow evaluation, canary promotion, rollback, organization policy packs, and reusable evaluation cohorts.

### Stage 5 — Commercial layer

Potential open-core boundary:

| Open source | Potential commercial offering |
|---|---|
| Local file bus and contracts | Organization policy control |
| Basic orchestration | Multi-repository fleet view |
| Local profiles | Managed profile registry |
| Local verification | Compliance evidence retention |
| Adapter SDK | Certified adapters |
| Single workspace console | SSO, RBAC, and audit export |
| Manual evaluation | Managed evaluation cohorts |

Commercial packaging is intentionally deferred until the open-source workflow demonstrates repeatable activation and retention.

## 19. Major risks and mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| Ambiguous execution authority | Critical | Phase 0 architecture decision and deterministic kernel |
| Self-reported success or cost | Critical | Independent verifier-owned evidence |
| Stale state treated as live | Critical | TTLs, leases, freshness labels, reconciliation ordering |
| Concurrent file-bus corruption | High | Atomic event ingestion or transactional local store |
| Agent identity spoofing | High | Session leases; signing when trust boundaries expand |
| Documentary-only scope enforcement | High | Assignment preflight plus post-run diff validation |
| Contract and state migration | High | Version every schema and test migrations |
| Dual-router version coupling | High | Adapter negotiation and conformance fixtures |
| Sparse or heterogeneous evolution data | High | Task-family cohorts, shadow tests, visible uncertainty |
| Coalition state explosion | High | Deterministic guard before bounded coalitions |
| Sensitive telemetry retention | Medium-high | Redaction, minimization, retention policy |
| Console exposed beyond localhost | Medium-high | Local-only default; authentication before remote access |
| Economy metric gaming | High | Simulation first and independent verification |
| Platform building without user value | High | Early dual-router vertical slice and benchmark comparison |

## 20. Defensibility

File-native state alone is not a durable moat. Defensibility should come from:

1. A neutral adapter ecosystem
2. Open interoperability contracts
3. Capability-specific verified performance history
4. Proven scope and collaboration policy
5. Evaluation and promotion datasets
6. An evidence graph linking task, agent, profile, artifact, review, and outcome
7. Reusable, evaluated community profiles and policy packs

## 21. Immediate next actions

1. Approve or revise the control-plane positioning and initial ICP.
2. Write the Phase 0 execution-authority ADR.
3. Define verified completion and select benchmark tasks.
4. Correct current stale-state and documentation contradictions.
5. Establish a contract/conformance test harness.
6. Define the minimum agent, assignment, event, evidence, and outcome schemas.
7. Implement one dual-router vertical slice before expanding coalition or evolution scope.

## 22. Market references

The market assessment should be refreshed periodically because the category changes quickly.

- [OpenAI Agents SDK](https://openai.com/index/the-next-evolution-of-the-agents-sdk/)
- [LangGraph](https://www.langchain.com/langgraph)
- [Microsoft Agent Framework](https://devblogs.microsoft.com/foundry/introducing-microsoft-agent-framework-the-open-source-engine-for-agentic-ai-apps/)
- [Google ADK evaluation](https://google.github.io/agents-cli/guide/evaluation/)
- [Google Agents CLI](https://google.github.io/agents-cli/cli/)
- [CrewAI](https://crewai.com/)
- [Letta](https://docs.letta.com/guides/get-started/intro)
- [UiPath Maestro](https://www.uipath.com/platform/agentic-automation/business-orchestration)
- [n8n AI Agents](https://n8n.io/ai-agents/)
- [Temporal documentation](https://docs.temporal.io/)
- [GitHub custom agents](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents)
