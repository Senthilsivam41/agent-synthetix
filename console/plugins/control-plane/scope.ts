import path from "node:path";
import { execFileSync } from "node:child_process";
import { minimatch } from "minimatch";

const GLOB_CHARS = /[*?[{!(]/;

export function normalizeScope(input: string, allowRepositoryWide = false) {
  const value = input.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!value || path.posix.isAbsolute(value) || value.split("/").includes("..")) {
    throw new Error(`invalid repository-relative scope: ${input}`);
  }
  if (!allowRepositoryWide && ["*", "**", "**/*", "."].includes(value)) {
    throw new Error(`repository-wide scope requires explicit allow_repository_wide: ${input}`);
  }
  return value;
}

export function staticPrefix(glob: string) {
  const parts = glob.split("/");
  const stable: string[] = [];
  for (const part of parts) {
    if (GLOB_CHARS.test(part)) break;
    stable.push(part);
  }
  return stable.join("/");
}

function containsPrefix(left: string, right: string) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function scopesOverlap(leftInput: string, rightInput: string, repositoryFiles: string[] = []) {
  const left = normalizeScope(leftInput, true);
  const right = normalizeScope(rightInput, true);
  if (["*", "**", "**/*", "."].includes(left) || ["*", "**", "**/*", "."].includes(right)) return true;
  if (repositoryFiles.some((file) => minimatch(file, left, { dot: true }) && minimatch(file, right, { dot: true }))) return true;
  const leftPrefix = staticPrefix(left);
  const rightPrefix = staticPrefix(right);
  if (!leftPrefix || !rightPrefix) return true;
  if (!containsPrefix(leftPrefix, rightPrefix)) return false;
  if (!GLOB_CHARS.test(left) && !GLOB_CHARS.test(right)) return left === right || containsPrefix(left, right);
  return true;
}

export function anyScopeOverlap(left: string[], right: string[], repositoryFiles: string[]) {
  return left.some((a) => right.some((b) => scopesOverlap(a, b, repositoryFiles)));
}

export function listRepositoryFiles(workspaceRoot: string) {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: workspaceRoot, encoding: "utf8" });
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function filesOutsideScopes(files: string[], scopes: string[]) {
  return files.filter((file) => !scopes.some((scope) => minimatch(file, scope, { dot: true })));
}
