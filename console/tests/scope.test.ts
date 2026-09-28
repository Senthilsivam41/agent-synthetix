import { readFileSync } from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  anyScopeOverlap,
  classifyPaths,
  filesOutsideScopes,
  normalizeScope,
  scopeMatch,
  scopesOverlap,
  type OverlapKind,
} from "../plugins/control-plane/scope";

const GLOB_CHARS = /[*?[{!(]/;

function staticPrefix(glob: string) {
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

/** Frozen pre-Phase-0 overlap oracle — boolean only. */
function legacyScopesOverlap(leftInput: string, rightInput: string, repositoryFiles: string[] = []) {
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

function fixtureTasks(name: string) {
  const raw = YAML.parse(readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8")) as {
    tasks: Array<{ id: string; write_scopes: string[] }>;
  };
  return raw.tasks;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RANK: Record<OverlapKind, number> = { none: 0, partial: 1, ancestor: 2, descendant: 3, exact: 4 };

describe("scope contracts", () => {
  it("rejects traversal, absolute paths, and broad scopes", () => {
    expect(() => normalizeScope("../secret")).toThrow();
    expect(() => normalizeScope("/tmp/file")).toThrow();
    expect(() => normalizeScope("**/*")).toThrow(/repository-wide/);
  });

  it("fails closed for ambiguous future-file prefixes", () => {
    expect(scopesOverlap("src/**/*.ts", "src/features/**")).not.toBe("none");
    expect(scopesOverlap("src/**", "docs/**")).toBe("none");
    expect(scopesOverlap("src/a.ts", "src/a.ts")).toBe("exact");
  });

  it("detects undeclared changes", () => {
    expect(filesOutsideScopes(["src/a.ts", "docs/oops.md"], ["src/**"])).toEqual(["docs/oops.md"]);
  });
});

describe("OverlapKind classifier", () => {
  it("classifies exact, ancestor, descendant, partial, and none between scopes", () => {
    expect(scopesOverlap("console/src/**", "console/src/**")).toBe("exact");
    expect(scopesOverlap("console/**", "console/src/**")).toBe("ancestor");
    expect(scopesOverlap("console/src/**", "console/**")).toBe("descendant");
    expect(scopesOverlap("src/**/*.ts", "src/features/**")).toBe("partial");
    expect(scopesOverlap("src/**", "docs/**")).toBe("none");
  });

  it("matches overlap.yaml as ancestor and disjoint.yaml as none", () => {
    const overlapping = fixtureTasks("overlap.yaml");
    expect(scopesOverlap(overlapping[0]!.write_scopes[0]!, overlapping[1]!.write_scopes[0]!)).toBe("ancestor");
    const disjoint = fixtureTasks("disjoint.yaml");
    expect(scopesOverlap(disjoint[0]!.write_scopes[0]!, disjoint[1]!.write_scopes[0]!)).toBe("none");
  });

  it("classifies file-to-scope matches without changing filesOutsideScopes", () => {
    expect(scopeMatch("src/a.ts", "src/a.ts")).toBe("exact");
    expect(scopeMatch("src/a.ts", "src/**")).toBe("descendant");
    expect(scopeMatch("src/a.ts", "**/*.ts")).toBe("partial");
    expect(scopeMatch("src/a.ts", "src")).toBe("none");
    expect(scopeMatch("docs/oops.md", "src/**")).toBe("none");
    expect(classifyPaths(["src/a.ts", "docs/oops.md"], ["src/**"]).get("src/a.ts")).toBe("descendant");
    expect(classifyPaths(["src/a.ts", "docs/oops.md"], ["src/**"]).get("docs/oops.md")).toBe("none");
  });
});

describe("call-site agreement", () => {
  it("keeps lease overlap and file membership identical to the frozen oracles", () => {
    const rng = mulberry32(20260928);
    const segments = ["src", "docs", "console", "features", "a", "b"];
    const pick = <T,>(items: T[]) => items[Math.floor(rng() * items.length)]!;
    const randomPath = () => {
      const depth = 1 + Math.floor(rng() * 3);
      const parts = Array.from({ length: depth }, () => pick(segments));
      return `${parts.join("/")}.${pick(["ts", "md", "json"])}`;
    };
    const randomScope = () => {
      const base = randomPath().replace(/\.(ts|md|json)$/, "");
      return pick([base, `${base}/**`, `${base}/*.ts`, "src/**", "docs/**", "**/*.ts"]);
    };

    const files = Array.from({ length: 24 }, randomPath);
    const scopes = Array.from({ length: 16 }, randomScope);

    const classified = classifyPaths(files, scopes);
    expect(filesOutsideScopes(files, scopes).sort()).toEqual(
      files.filter((file) => classified.get(file) === "none").sort(),
    );

    for (const file of files) {
      let strongest: OverlapKind = "none";
      for (const scope of scopes) {
        const kind = scopeMatch(file, scope);
        if (RANK[kind] > RANK[strongest]) strongest = kind;
        expect(kind === "none").toBe(!minimatch(file, scope, { dot: true }));
      }
      expect(classified.get(file)).toBe(strongest);
    }

    for (const left of scopes) {
      for (const right of scopes) {
        const kind = scopesOverlap(left, right, files);
        expect(kind !== "none").toBe(legacyScopesOverlap(left, right, files));
        expect(anyScopeOverlap([left], [right], files)).toBe(kind !== "none");
      }
    }
  });
});
