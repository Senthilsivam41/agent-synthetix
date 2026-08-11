import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ControlPlaneKernel } from "../plugins/control-plane/kernel";
import { SCHEMA_VERSION } from "../plugins/control-plane/contracts";

function git(root: string, args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function credential() {
  if (process.env.OPENAI_API_KEY) return { key: "OPENAI_API_KEY", planner: "openai/gpt-4o-mini", executor: "openai/gpt-4o-mini" };
  if (process.env.ANTHROPIC_API_KEY) return { key: "ANTHROPIC_API_KEY", planner: "anthropic/claude-3-5-haiku-20241022", executor: "anthropic/claude-3-5-haiku-20241022" };
  return null;
}

async function main() {
  const auth = credential();
  if (!auth) {
    process.stdout.write(`${JSON.stringify({ status: "skipped", reason: "OPENAI_API_KEY and ANTHROPIC_API_KEY are unavailable" })}\n`);
    return;
  }
  const routerPath = process.env.DUAL_ROUTER_PATH ?? path.resolve(process.cwd(), "../../dual-llm-router");
  await fsp.access(routerPath);
  const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-synthetix-live-router-"));
  const workspace = path.join(temporaryRoot, "workspace");
  let kernel: ControlPlaneKernel | null = null;
  let succeeded = false;
  try {
    await fsp.mkdir(path.join(workspace, "smoke"), { recursive: true });
    git(workspace, ["init", "-b", "main"]);
    git(workspace, ["config", "user.name", "agent-synthetix smoke"]);
    git(workspace, ["config", "user.email", "smoke@localhost"]);
    await fsp.writeFile(path.join(workspace, ".gitignore"), ".autoclaw/\n", "utf8");
    await fsp.writeFile(path.join(workspace, "README.md"), "# Live router smoke fixture\n", "utf8");
    await fsp.writeFile(path.join(workspace, "manifest.yaml"), `tasks:\n  - id: live-router-smoke\n    title: Write live router proof\n    goal: Create smoke/result.md containing a heading and one sentence confirming the live dual-router completed the task. Do not change any other file.\n    write_scopes: ["smoke/result.md"]\n    read_scopes: ["README.md", "smoke/**"]\n    agent_id: dual-router\n    reviewer_agent_id: independent-reviewer\n    acceptance_criteria: ["smoke/result.md exists and is non-empty"]\n    gates:\n      - name: result-exists\n        command: test -s smoke/result.md\n        required: true\n`, "utf8");
    git(workspace, ["add", "."]); git(workspace, ["commit", "-m", "live smoke fixture"]);

    kernel = new ControlPlaneKernel(workspace);
    await kernel.init();
    kernel.registerAgent({ agent_id: "dual-router", display_name: "Live dual router" });
    kernel.registerAgent({ agent_id: "independent-reviewer", display_name: "Independent smoke reviewer" });
    const worker = kernel.createSession("dual-router", 900);
    const reviewer = kernel.createSession("independent-reviewer", 900);
    const planned = await kernel.plan("manifest.yaml");
    const execution = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, {
      mode: "dual-router",
      python_executable: process.env.PYTHON_EXECUTABLE ?? "python3",
      router_path: routerPath,
      planner_model: auth.planner,
      executor_model: auth.executor,
      timeout_ms: 5 * 60_000,
      termination_grace_ms: 5_000,
      env_allowlist: [auth.key],
    });
    if (execution.state !== "awaiting_review") throw new Error(`live router ended in ${execution.state}`);
    const review = kernel.status().reviews.find((item) => String(item.execution_id) === execution.execution_id) as { review_id?: string } | undefined;
    const evidence = kernel.store.db.prepare("SELECT evidence_id FROM evidence WHERE execution_id=? ORDER BY created_at DESC LIMIT 1").get(execution.execution_id) as { evidence_id?: string } | undefined;
    if (!review?.review_id || !evidence?.evidence_id) throw new Error("live execution did not produce reviewable evidence");
    const accepted = await kernel.ingestVerdict({
      schema_version: SCHEMA_VERSION, event_id: randomUUID(), review_id: review.review_id,
      execution_id: execution.execution_id, reviewer_agent_id: "independent-reviewer", reviewer_session_id: reviewer.session_id,
      verdict: "approve", comments: "Live smoke gate and scope evidence verified", evidence_refs: [evidence.evidence_id], occurred_at: new Date().toISOString(),
    });
    if (accepted.state !== "accepted") throw new Error(`independent review ended in ${accepted.state}`);
    process.stdout.write(`${JSON.stringify({ status: "accepted", execution_id: accepted.execution_id, provider: auth.key === "OPENAI_API_KEY" ? "openai" : "anthropic" })}\n`);
    succeeded = true;
  } finally {
    kernel?.close();
    if (succeeded) await fsp.rm(temporaryRoot, { recursive: true, force: true });
    else process.stderr.write(`Live smoke workspace retained for diagnosis: ${temporaryRoot}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
