import path from "node:path";
import { execFileSync } from "node:child_process";
import { minimatch } from "minimatch";

const GLOB_CHARS = /[*?[{!(]/;
const REPO_WIDE = new Set(["*", "**", "**/*", "."]);
const MATCH_OPTIONS = { dot: true } as const;

export type OverlapKind = "none" | "exact" | "ancestor" | "descendant" | "partial";

const KIND_RANK: Record<OverlapKind, number> = {
  none: 0,
  partial: 1,
  ancestor: 2,
  descendant: 3,
  exact: 4,
};

function stronger(left: OverlapKind, right: OverlapKind): OverlapKind {
  return KIND_RANK[right] > KIND_RANK[left] ? right : left;
}

export function normalizeScope(input: string, allowRepositoryWide = false) {
  const value = input.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!value || path.posix.isAbsolute(value) || value.split("/").includes("..")) {
    throw new Error(`invalid repository-relative scope: ${input}`);
  }
  if (!allowRepositoryWide && REPO_WIDE.has(value)) {
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

function prefixRelation(left: string, right: string): OverlapKind {
  if (left === right) return "exact";
  if (right.startsWith(`${left}/`)) return "ancestor";
  if (left.startsWith(`${right}/`)) return "descendant";
  return "none";
}

function subtreeRemainder(scope: string, prefix: string) {
  if (prefix && scope.startsWith(`${prefix}/`)) return scope.slice(prefix.length + 1);
  if (prefix === scope) return "";
  return scope;
}

function isSubtreeScope(scope: string, prefix: string) {
  if (!GLOB_CHARS.test(scope)) return true;
  const rest = subtreeRemainder(scope, prefix);
  return rest === "**" || rest === "**/*" || rest === "*";
}

function classifyOverlappingPrefixes(left: string, right: string): OverlapKind {
  const leftPrefix = staticPrefix(left);
  const rightPrefix = staticPrefix(right);
  const nested = prefixRelation(leftPrefix, rightPrefix);
  if (nested === "ancestor") return isSubtreeScope(left, leftPrefix) ? "ancestor" : "partial";
  if (nested === "descendant") return isSubtreeScope(right, rightPrefix) ? "descendant" : "partial";
  const leftGlob = GLOB_CHARS.test(left);
  const rightGlob = GLOB_CHARS.test(right);
  if (!leftGlob && !rightGlob) {
    const literal = prefixRelation(left, right);
    return literal === "none" ? "partial" : literal;
  }
  return "partial";
}

export function scopesOverlap(leftInput: string, rightInput: string, repositoryFiles: string[] = []): OverlapKind {
  const left = normalizeScope(leftInput, true);
  const right = normalizeScope(rightInput, true);
  if (left === right) return "exact";
  if (REPO_WIDE.has(left) && REPO_WIDE.has(right)) return "exact";
  if (REPO_WIDE.has(left)) return "ancestor";
  if (REPO_WIDE.has(right)) return "descendant";

  const sharedFile = repositoryFiles.some(
    (file) => minimatch(file, left, MATCH_OPTIONS) && minimatch(file, right, MATCH_OPTIONS),
  );
  const leftPrefix = staticPrefix(left);
  const rightPrefix = staticPrefix(right);
  if (!leftPrefix || !rightPrefix) return "partial";
  if (!containsPrefix(leftPrefix, rightPrefix)) return sharedFile ? "partial" : "none";
  if (!GLOB_CHARS.test(left) && !GLOB_CHARS.test(right)) {
    const literal = prefixRelation(left, right);
    return literal === "none" ? "none" : literal;
  }
  return classifyOverlappingPrefixes(left, right);
}

export function anyScopeOverlap(left: string[], right: string[], repositoryFiles: string[]) {
  return left.some((a) => right.some((b) => scopesOverlap(a, b, repositoryFiles) !== "none"));
}

export function listRepositoryFiles(workspaceRoot: string) {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: workspaceRoot, encoding: "utf8" });
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function scopeMatch(candidatePath: string, scope: string): OverlapKind {
  const file = candidatePath.replaceAll("\\", "/");
  if (!minimatch(file, scope, MATCH_OPTIONS)) return "none";
  const normalizedFile = file.replace(/^\.\//, "").replace(/\/+$/, "");
  const normalizedScope = scope.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (normalizedFile === normalizedScope) return "exact";
  const prefix = staticPrefix(normalizedScope);
  if (prefix) {
    if (normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`)) return "descendant";
    if (prefix === normalizedFile || prefix.startsWith(`${normalizedFile}/`)) return "ancestor";
  }
  return "partial";
}

export function classifyPaths(paths: string[], scopes: string[]): Map<string, OverlapKind> {
  const classified = new Map<string, OverlapKind>();
  for (const candidate of paths) {
    let kind: OverlapKind = "none";
    for (const scope of scopes) kind = stronger(kind, scopeMatch(candidate, scope));
    classified.set(candidate, kind);
  }
  return classified;
}

export function filesOutsideScopes(files: string[], scopes: string[]) {
  const classified = classifyPaths(files, scopes);
  return files.filter((file) => classified.get(file) === "none");
}
