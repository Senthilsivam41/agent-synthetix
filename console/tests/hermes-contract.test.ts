import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type TaskAssignment } from "../plugins/control-plane/contracts";
import {
  assignmentFingerprint,
  contractHonorsAssignment,
  toHermesCompletionContract,
} from "../plugins/control-plane/hermes-contract";

function assignment(overrides: Partial<TaskAssignment> = {}): TaskAssignment {
  return {
    schema_version: SCHEMA_VERSION,
    assignment_id: "assign-1",
    task_id: "task-1",
    sprint_id: null,
    title: "Scoped edit",
    goal: "Update the left module",
    dependencies: [],
    read_scopes: ["src/**", "docs/README.md"],
    write_scopes: ["src/left/**"],
    acceptance_criteria: ["src/left/result.txt exists"],
    required_capabilities: ["workspace-write"],
    gates: [{ name: "exists", command: "test -f src/left/result.txt", required: true }],
    base_commit: "abc123",
    assigned_agent_id: "worker",
    reviewer_agent_id: "reviewer",
    created_at: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

const worktree = path.join(os.tmpdir(), "hermes-contract-worktree");

describe("Hermes completion contract", () => {
  it("copies outcome, verification, constraints, and boundaries without widening scope or downgrading gates", () => {
    const input = assignment();
    const contract = toHermesCompletionContract(input, worktree, "contract-fixed");
    expect(contract).toMatchObject({
      schema_version: SCHEMA_VERSION,
      contract_id: "contract-fixed",
      assignment_id: "assign-1",
      outcome: "Update the left module",
      verification: {
        acceptance_criteria: ["src/left/result.txt exists"],
        gates: [{ name: "exists", command: "test -f src/left/result.txt", required: true }],
      },
      constraints: {
        required_capabilities: ["workspace-write"],
        ambiguous_scopes: [],
      },
      boundaries: {
        read_scopes: ["src/**", "docs/README.md"],
        write_scopes: ["src/left/**"],
      },
      correlation: {
        task_id: "task-1",
        base_commit: "abc123",
        assigned_agent_id: "worker",
      },
    });
    expect(contract.worktree_path).toBe(path.resolve(worktree));
    expect(contract.stop_when.length).toBeGreaterThan(0);
    expect(contract.assignment_fingerprint).toBe(assignmentFingerprint(input));
    expect(contractHonorsAssignment(contract, input)).toBe(true);
  });

  it("flags ambiguous write scopes without treating them as repository-wide", () => {
    const input = assignment({ write_scopes: ["src"] });
    const contract = toHermesCompletionContract(input, worktree, "contract-ambiguous");
    expect(contract.boundaries.write_scopes).toEqual(["src"]);
    expect(contract.constraints.ambiguous_scopes).toEqual(["src"]);
    expect(contractHonorsAssignment(contract, input)).toBe(true);
  });

  it("rejects repository-wide write scopes", () => {
    expect(() => toHermesCompletionContract(assignment({ write_scopes: ["**"] }), worktree)).toThrow(/repository-wide/);
    expect(() => toHermesCompletionContract(assignment({ write_scopes: ["."] }), worktree)).toThrow(/repository-wide/);
    expect(() => toHermesCompletionContract(assignment({ write_scopes: [] }), worktree)).toThrow(/non-empty write scope/);
  });

  it("preserves an empty gate list", () => {
    const input = assignment({ gates: [] });
    const contract = toHermesCompletionContract(input, worktree, "contract-no-gate");
    expect(contract.verification.gates).toEqual([]);
    expect(contractHonorsAssignment(contract, input)).toBe(true);
  });

  it("keeps the stored contract independent of later assignment mutation", () => {
    const input = assignment();
    const contract = toHermesCompletionContract(input, worktree, "contract-mutation");
    input.write_scopes.push("**");
    input.gates[0]!.required = false;
    expect(contract.boundaries.write_scopes).toEqual(["src/left/**"]);
    expect(contract.verification.gates[0]?.required).toBe(true);
    expect(contractHonorsAssignment(contract, input)).toBe(false);
  });

  it("rejects a tampered contract that widens scope or downgrades a required gate", () => {
    const input = assignment();
    const contract = toHermesCompletionContract(input, worktree, "contract-tamper");
    const widened = structuredClone(contract);
    widened.boundaries.write_scopes = ["**"];
    expect(contractHonorsAssignment(widened, input)).toBe(false);
    const downgraded = structuredClone(contract);
    downgraded.verification.gates[0]!.required = false;
    expect(contractHonorsAssignment(downgraded, input)).toBe(false);
  });
});
