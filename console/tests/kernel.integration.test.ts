import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../plugins/control-plane/contracts";
import { ControlPlaneKernel } from "../plugins/control-plane/kernel";

const roots: string[] = [];
function git(root: string, args: string[]) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }

async function repository(tasks: unknown[]) {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-kernel-")); roots.push(base);
  const root = path.join(base, "repo"); await fsp.mkdir(root);
  git(root, ["init", "-b", "main"]); git(root, ["config", "user.name", "Test"]); git(root, ["config", "user.email", "test@example.com"]);
  await fsp.writeFile(path.join(root, ".gitignore"), ".autoclaw/\n", "utf8");
  await fsp.mkdir(path.join(root, "src")); await fsp.writeFile(path.join(root, "src", "base.txt"), "base\n", "utf8");
  const manifest = `tasks:\n${tasks.map((task) => `  - ${JSON.stringify(task)}`).join("\n")}\n`;
  await fsp.writeFile(path.join(root, "manifest.yaml"), manifest, "utf8");
  git(root, ["add", "."]); git(root, ["commit", "-m", "fixture"]);
  return root;
}

afterEach(async () => { for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true }); });

describe("control-plane vertical slice", () => {
  it("runs disjoint assignments without overlapping leases", async () => {
    const root = await repository([
      { id: "left", write_scopes: ["src/left/**"], agent_id: "left-agent", reviewer_agent_id: "reviewer" },
      { id: "right", write_scopes: ["src/right/**"], agent_id: "right-agent", reviewer_agent_id: "reviewer" },
    ]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAgent({ agent_id: "left-agent", display_name: "Left" }); kernel.registerAgent({ agent_id: "right-agent", display_name: "Right" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const leftSession = kernel.createSession("left-agent"); const rightSession = kernel.createSession("right-agent");
    const planned = await kernel.plan("manifest.yaml");
    const [left, right] = await Promise.all([
      kernel.run(planned.assignments[0]!.assignment_id, leftSession.session_id, { mode: "mock", mock_changes: { "src/left/result.txt": "left\n" } }),
      kernel.run(planned.assignments[1]!.assignment_id, rightSession.session_id, { mode: "mock", mock_changes: { "src/right/result.txt": "right\n" } }),
    ]);
    expect([left.state, right.state]).toEqual(["awaiting_review", "awaiting_review"]);
    expect(kernel.status().leases).toHaveLength(2);
    kernel.close();
  });

  it("requires deterministic evidence and an independent reviewer before acceptance", async () => {
    const root = await repository([{ id: "task-a", title: "Change source", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer", gates: [{ name: "exists", command: "test -f src/result.txt", required: true }] }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker"); const reviewer = kernel.createSession("reviewer");
    const planned = await kernel.plan("manifest.yaml");
    const execution = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, { mode: "mock", mock_changes: { "src/result.txt": "done\n" } });
    expect(execution.state).toBe("awaiting_review");
    const review = kernel.status().reviews[0] as { review_id: string };
    const evidence = kernel.store.db.prepare("SELECT evidence_id FROM evidence WHERE execution_id=?").get(execution.execution_id) as { evidence_id: string };
    await expect(kernel.ingestVerdict({ schema_version: SCHEMA_VERSION, event_id: crypto.randomUUID(), review_id: review.review_id, execution_id: execution.execution_id, reviewer_agent_id: "worker", reviewer_session_id: worker.session_id, verdict: "approve", comments: "self", evidence_refs: [evidence.evidence_id], occurred_at: new Date().toISOString() })).rejects.toThrow();
    const requested = await kernel.ingestVerdict({ schema_version: SCHEMA_VERSION, event_id: crypto.randomUUID(), review_id: review.review_id, execution_id: execution.execution_id, reviewer_agent_id: "reviewer", reviewer_session_id: reviewer.session_id, verdict: "request_changes", comments: "revise", evidence_refs: [evidence.evidence_id], occurred_at: new Date().toISOString() });
    expect(requested.state).toBe("changes_requested");
    const retried = await kernel.retry(execution.execution_id, worker.session_id);
    expect(retried.state).toBe("awaiting_review");
    const nextReview = kernel.status().reviews.find((item) => String(item.execution_id) === retried.execution_id) as { review_id: string };
    const nextEvidence = kernel.store.db.prepare("SELECT evidence_id FROM evidence WHERE execution_id=?").get(retried.execution_id) as { evidence_id: string };
    const accepted = await kernel.ingestVerdict({ schema_version: SCHEMA_VERSION, event_id: crypto.randomUUID(), review_id: nextReview.review_id, execution_id: retried.execution_id, reviewer_agent_id: "reviewer", reviewer_session_id: reviewer.session_id, verdict: "approve", comments: "verified", evidence_refs: [nextEvidence.evidence_id], occurred_at: new Date().toISOString() });
    expect(accepted.state).toBe("accepted");
    expect(kernel.replayExecution(retried.execution_id)).toBe("accepted");
    expect(kernel.status().leases).toHaveLength(0);
    kernel.close();
  });

  it("blocks an overlapping lease and rejects an out-of-scope diff", async () => {
    const root = await repository([
      { id: "one", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer" },
      { id: "two", write_scopes: ["src/base.txt"], agent_id: "worker", reviewer_agent_id: "reviewer" },
      { id: "three", write_scopes: ["src/**"], agent_id: "worker", reviewer_agent_id: "reviewer" },
    ]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker"); kernel.createSession("reviewer");
    const planned = await kernel.plan("manifest.yaml");
    const first = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, { mode: "mock" });
    expect(first.state).toBe("awaiting_review");
    await expect(kernel.run(planned.assignments[1]!.assignment_id, worker.session_id, { mode: "mock" })).rejects.toThrow(/active lease/);
    kernel.cancel(first.execution_id);
    const violation = await kernel.run(planned.assignments[2]!.assignment_id, worker.session_id, { mode: "mock", mock_changes: { "docs/oops.md": "outside\n" } });
    expect(violation.state).toBe("failed"); expect(violation.failure_code).toBe("scope_violation");
    expect(kernel.status().findings.some((finding) => String(finding.category) === "scope_violation")).toBe(true);
    kernel.close();
  });

  it("requires a fresh registered adapter capability for capability-constrained work", async () => {
    const root = await repository([{ id: "capability-task", write_scopes: ["src/**"], required_capabilities: ["special-tool"], agent_id: "worker", reviewer_agent_id: "reviewer" }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAdapter({ adapter_type: "fixture", display_name: "Fixture", version: "1", capabilities: ["special-tool"] });
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker", adapter_type: "fixture" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker");
    const planned = await kernel.plan("manifest.yaml");
    const execution = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, { mode: "mock", mock_changes: { "src/capability.txt": "ok\n" } });
    expect(execution.state).toBe("awaiting_review");
    kernel.close();
  });

  it("fails closed when a required adapter capability snapshot is stale", async () => {
    const root = await repository([{ id: "stale-task", write_scopes: ["src/**"], required_capabilities: ["special-tool"], agent_id: "worker", reviewer_agent_id: "reviewer" }]);
    const kernel = new ControlPlaneKernel(root); await kernel.init();
    kernel.registerAdapter({ adapter_type: "stale-fixture", display_name: "Stale fixture", version: "1", capabilities: ["special-tool"], ttl_seconds: -1 });
    kernel.registerAgent({ agent_id: "worker", display_name: "Worker", adapter_type: "stale-fixture" }); kernel.registerAgent({ agent_id: "reviewer", display_name: "Reviewer" });
    const worker = kernel.createSession("worker");
    const planned = await kernel.plan("manifest.yaml");
    await expect(kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, { mode: "mock" })).rejects.toThrow(/capability snapshot is stale/);
    kernel.close();
  });
});
