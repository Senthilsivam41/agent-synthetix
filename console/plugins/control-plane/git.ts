import fsp from "node:fs/promises";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import type { GateResult, GateSpec } from "./contracts";

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function assertCleanWorkspace(workspaceRoot: string) {
  const status = git(workspaceRoot, ["status", "--porcelain"]);
  if (status) throw new Error("primary workspace must be clean before isolated execution");
}

export function resolveCommit(workspaceRoot: string, ref = "HEAD") {
  return git(workspaceRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
}

export async function createExecutionWorktree(workspaceRoot: string, executionId: string, taskId: string, baseCommit: string, branchPrefix = "feat/sprint") {
  const workspaceName = path.basename(workspaceRoot);
  const worktreePath = path.join(path.dirname(workspaceRoot), ".autoclaw-worktrees", workspaceName, executionId);
  await fsp.mkdir(path.dirname(worktreePath), { recursive: true });
  const safeTask = taskId.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40);
  const branchName = `${branchPrefix}/${safeTask}-${executionId.slice(0, 8)}`;
  execFileSync("git", ["worktree", "add", "-b", branchName, worktreePath, baseCommit], { cwd: workspaceRoot, stdio: "pipe" });
  return { worktreePath, branchName };
}

export async function collectGitEvidence(worktreePath: string, baseCommit: string, artifactRoot: string) {
  await fsp.mkdir(artifactRoot, { recursive: true });
  const trackedStatus = git(worktreePath, ["diff", "--name-status", baseCommit]);
  const untracked = git(worktreePath, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  const nameStatus = [trackedStatus, ...untracked.map((file) => `A\t${file}`)].filter(Boolean).join("\n");
  const changedFiles = [...new Set(nameStatus.split("\n").filter(Boolean).flatMap((line) => {
    const columns = line.split("\t");
    return /^[RC]/.test(columns[0] ?? "") ? columns.slice(1) : columns.slice(-1);
  }).filter(Boolean))];
  let patch = execFileSync("git", ["diff", "--binary", baseCommit], { cwd: worktreePath, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  for (const file of untracked) {
    const addition = spawnSync("git", ["diff", "--no-index", "--binary", "--", "/dev/null", file], { cwd: worktreePath, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    patch += addition.stdout ?? "";
  }
  const patchPath = path.join(artifactRoot, "changes.patch");
  await fsp.writeFile(patchPath, patch, "utf8");
  const temporaryIndex = path.join(artifactRoot, ".evidence-index");
  const evidenceEnv = { ...process.env, GIT_INDEX_FILE: temporaryIndex };
  execFileSync("git", ["read-tree", "HEAD"], { cwd: worktreePath, env: evidenceEnv, stdio: "pipe" });
  execFileSync("git", ["add", "-A"], { cwd: worktreePath, env: evidenceEnv, stdio: "pipe" });
  const resultingTree = execFileSync("git", ["write-tree"], { cwd: worktreePath, env: evidenceEnv, encoding: "utf8" }).trim();
  await fsp.rm(temporaryIndex, { force: true });
  return {
    changedFiles,
    nameStatus,
    patchPath,
    headCommit: resolveCommit(worktreePath),
    resultingTree,
  };
}

export async function runGates(worktreePath: string, gates: GateSpec[], artifactRoot: string): Promise<GateResult[]> {
  const results: GateResult[] = [];
  for (const gate of gates) {
    const run = spawnSync(gate.command, { cwd: worktreePath, shell: true, encoding: "utf8", timeout: 15 * 60_000 });
    const outputPath = path.join(artifactRoot, `gate-${gate.name.replace(/[^a-zA-Z0-9._-]/g, "-")}.log`);
    await fsp.writeFile(outputPath, `${run.stdout ?? ""}${run.stderr ?? ""}`, "utf8");
    results.push({ name: gate.name, command: gate.command, required: gate.required, passed: run.status === 0, exit_code: run.status, output_path: outputPath });
  }
  return results;
}

export function commitExecutionChanges(worktreePath: string, message: string) {
  if (!git(worktreePath, ["status", "--porcelain"])) return resolveCommit(worktreePath);
  execFileSync("git", ["add", "-A"], { cwd: worktreePath, stdio: "pipe" });
  execFileSync("git", ["-c", "user.name=agent-synthetix", "-c", "user.email=control-plane@localhost", "commit", "-m", message], { cwd: worktreePath, stdio: "pipe" });
  return resolveCommit(worktreePath);
}

export function removeExecutionWorktree(workspaceRoot: string, worktreePath: string) {
  execFileSync("git", ["worktree", "remove", worktreePath], { cwd: workspaceRoot, stdio: "pipe" });
  execFileSync("git", ["worktree", "prune"], { cwd: workspaceRoot, stdio: "pipe" });
}
