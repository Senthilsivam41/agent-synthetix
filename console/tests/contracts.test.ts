import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, STATE_TRANSITIONS, type PlanManifest } from "../plugins/control-plane/contracts";
import { CONTRACT_SCHEMAS, parseExecutionEvent, parseReviewVerdict, validateContract } from "../plugins/control-plane/schemas";

const validVerdict = {
  schema_version: SCHEMA_VERSION,
  event_id: "event-1",
  review_id: "review-1",
  execution_id: "execution-1",
  reviewer_agent_id: "reviewer",
  reviewer_session_id: "session-1",
  verdict: "approve",
  comments: "verified",
  evidence_refs: ["evidence-1"],
  occurred_at: "2026-08-11T00:00:00.000Z",
} as const;

describe("versioned contracts and lifecycle", () => {
  it("publishes every control-plane schema", () => {
    expect(Object.keys(CONTRACT_SCHEMAS)).toEqual(expect.arrayContaining(["AgentProfile", "AgentSession", "TaskAssignment", "ExecutionEvent", "ArtifactManifest", "VerificationEvidence", "ReviewRequest", "ReviewVerdict", "ExecutionSummary", "GuardFinding", "AdapterRegistration", "CapabilitySnapshot", "HermesCompletionContract", "ExternalRunRecord"]));
  });

  it("rejects unknown schema versions and malformed verdicts", () => {
    expect(() => parseReviewVerdict({ schema_version: "99.0" })).toThrow(/unsupported/);
    expect(() => parseReviewVerdict({ schema_version: SCHEMA_VERSION, event_id: "e" })).toThrow(/missing/);
  });

  it("strictly rejects unknown fields and mistyped verdict fields", () => {
    expect(() => parseReviewVerdict({ ...validVerdict, unexpected: true })).toThrow(/unexpected|additional/i);
    expect(() => parseReviewVerdict({ ...validVerdict, evidence_refs: "evidence-1" })).toThrow(/evidence_refs|array/i);
    expect(parseReviewVerdict(validVerdict).verdict).toBe("approve");
  });

  it("strictly validates execution event payload shape and field types", () => {
    const event = {
      schema_version: SCHEMA_VERSION,
      event_id: "event-1",
      event_type: "telemetry",
      execution_id: "execution-1",
      assignment_id: "assignment-1",
      agent_id: "agent-1",
      session_id: "session-1",
      occurred_at: "2026-08-11T00:00:00.000Z",
      payload: { attempt: 1 },
    };
    expect(parseExecutionEvent(event).event_type).toBe("telemetry");
    expect(() => parseExecutionEvent({ ...event, payload: [] })).toThrow(/payload|object/i);
    expect(() => parseExecutionEvent({ ...event, agent_id: 42 })).toThrow(/agent_id|string/i);
  });

  it("strictly validates externally supplied plan manifests", () => {
    const manifest = { project: "demo", tasks: [{ id: "task-1", write_scopes: ["src/**"] }] };
    expect(validateContract<PlanManifest>("PlanManifest", manifest, "plan manifest").tasks).toHaveLength(1);
    expect(validateContract<PlanManifest>("PlanManifest", {
      tasks: [{ id: "gh-42", github_issue: 42, github_url: "https://github.com/acme/demo/issues/42", source: "github_issue", write_scopes: ["src/**"] }],
    }, "plan manifest").tasks[0]?.github_issue).toBe(42);
    expect(() => validateContract<PlanManifest>("PlanManifest", { ...manifest, extra: true }, "plan manifest")).toThrow(/unexpected property extra/);
    expect(() => validateContract<PlanManifest>("PlanManifest", { tasks: [{ id: "task-1", write_scopes: "src/**" }] }, "plan manifest")).toThrow(/write_scopes|array/i);
  });

  it("allows only the documented transitions", () => {
    expect(STATE_TRANSITIONS.queued).toContain("preparing");
    expect(STATE_TRANSITIONS.running).not.toContain("accepted");
    expect(STATE_TRANSITIONS.awaiting_review).toEqual(expect.arrayContaining(["accepted", "changes_requested", "rejected"]));
    expect(STATE_TRANSITIONS.accepted).toEqual([]);
  });
});
