import { describe, expect, it } from "vitest";
import {
  applyClarificationAnswers,
  classifyRuntimePath,
  inspectPlan,
  parseClarifications,
  parseJsonLines,
} from "../plugins/orchestratorFiles";

describe("orchestrator compatibility files", () => {
  it("parses at most five open questions and existing answers", () => {
    const text = `# Clarifications\n\n## Open\n\n1. Primary goal?\n2. In scope?\n3. Deadline?\n4. Audience?\n5. Constraints?\n6. This must not appear?\n\n## Answered\n\n### Primary owner?\nSendil\n`;
    const parsed = parseClarifications(text);
    expect(parsed.open).toEqual(["Primary goal?", "In scope?", "Deadline?", "Audience?", "Constraints?"]);
    expect(parsed.answered.map((item) => item.question)).toContain("Primary owner?");
  });

  it("moves answered questions while retaining unanswered questions", () => {
    const text = `# Clarifications\n\n## Open\n\n1. Primary goal?\n2. Deadline?\n\n## Answered\n\n_(none yet)_\n`;
    const updated = applyClarificationAnswers(text, [{ question: "Primary goal?", answer: "Ship safely" }]);
    expect(updated).toContain("1. Deadline?");
    expect(updated).toContain("### Primary goal?");
    expect(updated).toContain("Ship safely");
    expect(updated).not.toContain("_(none yet)_");
  });

  it("extracts plan metadata and blocks missing task scopes", () => {
    const plan = `---\nstatus: awaiting_approval\nversion: 3\n---\n# Project Plan — Control Plane\n\n## Goal\nShip the workflow.\n\n## Tasks\n- id: task-1\n  name: Scoped\n  scope: [console/src/**]\n- id: task-2\n  name: Missing\n`;
    const inspected = inspectPlan(plan);
    expect(inspected.title).toBe("Project Plan — Control Plane");
    expect(inspected.goal).toBe("Ship the workflow.");
    expect(inspected.version).toBe(3);
    expect(inspected.scope_warnings).toEqual(["task-2 has no declared scope"]);
    expect(inspected.can_approve).toBe(false);
  });

  it("parses command logs without failing the entire activity feed", () => {
    const result = parseJsonLines(`{"id":"one","command":"/orchestrate ask"}\nnot-json\n{"id":"two","command":"/orchestrate approve"}\n`);
    expect(result.items).toHaveLength(2);
    expect(result.malformed).toBe(1);
  });

  it("maps watched paths to stable invalidation areas", () => {
    expect(classifyRuntimePath("plans/project-plan.md")).toBe("plans");
    expect(classifyRuntimePath("commands/processed.jsonl")).toBe("commands");
    expect(classifyRuntimePath("control-plane.db-wal")).toBe("control-plane");
    expect(classifyRuntimePath("logs/noise.log")).toBeNull();
  });
});
