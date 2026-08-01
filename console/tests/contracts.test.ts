import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, STATE_TRANSITIONS } from "../plugins/control-plane/contracts";
import { CONTRACT_SCHEMAS, parseReviewVerdict } from "../plugins/control-plane/schemas";

describe("versioned contracts and lifecycle", () => {
  it("publishes every control-plane schema", () => {
    expect(Object.keys(CONTRACT_SCHEMAS)).toEqual(expect.arrayContaining(["AgentProfile", "AgentSession", "TaskAssignment", "ExecutionEvent", "ArtifactManifest", "VerificationEvidence", "ReviewRequest", "ReviewVerdict", "ExecutionSummary", "GuardFinding"]));
  });

  it("rejects unknown schema versions and malformed verdicts", () => {
    expect(() => parseReviewVerdict({ schema_version: "99.0" })).toThrow(/unsupported/);
    expect(() => parseReviewVerdict({ schema_version: SCHEMA_VERSION, event_id: "e" })).toThrow(/missing/);
  });

  it("allows only the documented transitions", () => {
    expect(STATE_TRANSITIONS.queued).toContain("preparing");
    expect(STATE_TRANSITIONS.running).not.toContain("accepted");
    expect(STATE_TRANSITIONS.awaiting_review).toEqual(expect.arrayContaining(["accepted", "changes_requested", "rejected"]));
    expect(STATE_TRANSITIONS.accepted).toEqual([]);
  });
});
