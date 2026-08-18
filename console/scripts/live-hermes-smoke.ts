import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ControlPlaneKernel } from "../plugins/control-plane/kernel";
import { SCHEMA_VERSION } from "../plugins/control-plane/contracts";
import { HERMES_TARGET_VERSION, inspectHermesRuntime } from "../plugins/control-plane/hermes-compatibility";

function git(root: string, args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function main() {
  if (process.env.HERMES_LIVE_SMOKE !== "1") {
    process.stdout.write(`${JSON.stringify({ status: "skipped", reason: "HERMES_LIVE_SMOKE is not 1" })}\n`);
    return;
  }
  const executable = process.env.HERMES_EXECUTABLE ?? "hermes";
  const compatibility = inspectHermesRuntime(executable);
  if (compatibility.status !== "supported" || compatibility.detected_version !== HERMES_TARGET_VERSION) {
    process.stdout.write(`${JSON.stringify({
      status: "skipped",
      reason: `live Hermes smoke requires pinned ${HERMES_TARGET_VERSION}`,
      compatibility,
    })}\n`);
    return;
  }
  const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-synthetix-live-hermes-"));
  const workspace = path.join(temporaryRoot, "workspace");
  let kernel: ControlPlaneKernel | null = null;
  let succeeded = false;
  try {
    await fsp.mkdir(path.join(workspace, "smoke"), { recursive: true });
    git(workspace, ["init", "-b", "main"]);
    git(workspace, ["config", "user.name", "agent-synthetix smoke"]);
    git(workspace, ["config", "user.email", "smoke@localhost"]);
    await fsp.writeFile(path.join(workspace, ".gitignore"), ".autoclaw/\n", "utf8");
    await fsp.writeFile(path.join(workspace, "README.md"), "# Live Hermes smoke fixture\n", "utf8");
    await fsp.writeFile(path.join(workspace, "manifest.yaml"), `tasks:\n  - id: live-hermes-smoke\n    title: Write live Hermes proof\n    goal: Create smoke/result.md containing a heading and one sentence confirming the live Hermes Agent completed the task. Do not change any other file.\n    write_scopes: ["smoke/result.md"]\n    read_scopes: ["README.md", "smoke/**"]\n    agent_id: hermes-worker\n    reviewer_agent_id: independent-reviewer\n    acceptance_criteria: ["smoke/result.md exists and is non-empty"]\n    gates:\n      - name: result-exists\n        command: test -s smoke/result.md\n        required: true\n`, "utf8");
    git(workspace, ["add", "."]); git(workspace, ["commit", "-m", "live hermes smoke fixture"]);

    kernel = new ControlPlaneKernel(workspace);
    await kernel.init();
    kernel.registerAgent({ agent_id: "hermes-worker", display_name: "Live Hermes worker" });
    kernel.registerAgent({ agent_id: "independent-reviewer", display_name: "Independent smoke reviewer" });
    const worker = kernel.createSession("hermes-worker", 900);
    const reviewer = kernel.createSession("independent-reviewer", 900);
    const planned = await kernel.plan("manifest.yaml");
    const execution = await kernel.run(planned.assignments[0]!.assignment_id, worker.session_id, {
      mode: "hermes",
      hermes_enabled: true,
      hermes_executable: executable,
      timeout_ms: 5 * 60_000,
      termination_grace_ms: 5_000,
      env_allowlist: [],
    });
    if (execution.state !== "awaiting_review") throw new Error(`live Hermes ended in ${execution.state}`);
    const review = kernel.status().reviews.find((item) => String(item.execution_id) === execution.execution_id) as { review_id?: string } | undefined;
    const evidence = kernel.store.db.prepare("SELECT evidence_id FROM evidence WHERE execution_id=? ORDER BY created_at DESC LIMIT 1").get(execution.execution_id) as { evidence_id?: string } | undefined;
    if (!review?.review_id || !evidence?.evidence_id) throw new Error("live execution did not produce reviewable evidence");
    const accepted = await kernel.ingestVerdict({
      schema_version: SCHEMA_VERSION, event_id: randomUUID(), review_id: review.review_id,
      execution_id: execution.execution_id, reviewer_agent_id: "independent-reviewer", reviewer_session_id: reviewer.session_id,
      verdict: "approve", comments: "Live Hermes smoke gate and scope evidence verified", evidence_refs: [evidence.evidence_id], occurred_at: new Date().toISOString(),
    });
    if (accepted.state !== "accepted") throw new Error(`independent review ended in ${accepted.state}`);
    process.stdout.write(`${JSON.stringify({ status: "accepted", execution_id: accepted.execution_id, hermes_version: compatibility.detected_version })}\n`);
    succeeded = true;
  } finally {
    kernel?.close();
    if (succeeded) await fsp.rm(temporaryRoot, { recursive: true, force: true });
    else process.stderr.write(`Live Hermes smoke workspace retained for diagnosis: ${temporaryRoot}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
