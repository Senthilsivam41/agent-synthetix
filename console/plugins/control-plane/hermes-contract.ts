import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { SCHEMA_VERSION, type GateSpec, type HermesCompletionContract, type TaskAssignment } from "./contracts";

const REPO_WIDE = new Set(["**", "**/*", "*", ".", "/", ""]);

export function assignmentFingerprint(assignment: TaskAssignment) {
  return createHash("sha256").update(JSON.stringify({
    assignment_id: assignment.assignment_id,
    task_id: assignment.task_id,
    goal: assignment.goal,
    read_scopes: [...assignment.read_scopes],
    write_scopes: [...assignment.write_scopes],
    acceptance_criteria: [...assignment.acceptance_criteria],
    required_capabilities: [...assignment.required_capabilities],
    gates: assignment.gates.map((gate) => ({ name: gate.name, command: gate.command, required: gate.required })),
    base_commit: assignment.base_commit,
  })).digest("hex");
}

export function isRepositoryWideScope(scope: string) {
  const normalized = scope.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  return REPO_WIDE.has(normalized);
}

export function isAmbiguousScope(scope: string) {
  return !scope.includes("*") && !scope.includes("/") && !scope.includes(".");
}

export function toHermesCompletionContract(assignment: TaskAssignment, worktreePath: string, contractId: string = randomUUID()): HermesCompletionContract {
  const writeScopes = assignment.write_scopes.map((scope) => scope.trim()).filter(Boolean);
  if (!writeScopes.length) throw new Error("Hermes completion contract requires a non-empty write scope");
  const widened = writeScopes.filter(isRepositoryWideScope);
  if (widened.length) throw new Error(`Hermes adapter cannot add repository-wide scope: ${widened.join(", ")}`);
  const gates: GateSpec[] = assignment.gates.map((gate) => ({ name: gate.name, command: gate.command, required: gate.required }));
  const contract: HermesCompletionContract = {
    schema_version: SCHEMA_VERSION,
    contract_id: contractId,
    assignment_id: assignment.assignment_id,
    worktree_path: path.resolve(worktreePath),
    outcome: assignment.goal,
    verification: {
      acceptance_criteria: [...assignment.acceptance_criteria],
      gates,
    },
    constraints: {
      required_capabilities: [...assignment.required_capabilities],
      ambiguous_scopes: writeScopes.filter(isAmbiguousScope),
    },
    boundaries: {
      read_scopes: [...assignment.read_scopes],
      write_scopes: writeScopes,
    },
    stop_when: [
      "leave write scopes",
      "fail a required gate",
      "timeout or cancellation",
      "request approval when the runtime blocks",
    ],
    correlation: {
      task_id: assignment.task_id,
      base_commit: assignment.base_commit,
      assigned_agent_id: assignment.assigned_agent_id,
    },
    assignment_fingerprint: assignmentFingerprint(assignment),
  };
  return structuredClone(contract);
}

export function contractHonorsAssignment(contract: HermesCompletionContract, assignment: TaskAssignment) {
  if (contract.assignment_fingerprint !== assignmentFingerprint(assignment)) return false;
  if (contract.assignment_id !== assignment.assignment_id) return false;
  if (contract.boundaries.write_scopes.some(isRepositoryWideScope)) return false;
  if (contract.boundaries.write_scopes.some((scope) => !assignment.write_scopes.includes(scope))) return false;
  if (contract.boundaries.write_scopes.length !== assignment.write_scopes.length) return false;
  for (const gate of assignment.gates) {
    const mapped = contract.verification.gates.find((item) => item.name === gate.name);
    if (!mapped) return false;
    if (gate.required && !mapped.required) return false;
  }
  return true;
}
