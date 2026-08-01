import { describe, expect, it } from "vitest";
import { filesOutsideScopes, normalizeScope, scopesOverlap } from "../plugins/control-plane/scope";

describe("scope contracts", () => {
  it("rejects traversal, absolute paths, and broad scopes", () => {
    expect(() => normalizeScope("../secret")).toThrow();
    expect(() => normalizeScope("/tmp/file")).toThrow();
    expect(() => normalizeScope("**/*")).toThrow(/repository-wide/);
  });

  it("fails closed for ambiguous future-file prefixes", () => {
    expect(scopesOverlap("src/**/*.ts", "src/features/**", [])).toBe(true);
    expect(scopesOverlap("src/**", "docs/**", [])).toBe(false);
    expect(scopesOverlap("src/a.ts", "src/a.ts", [])).toBe(true);
  });

  it("detects undeclared changes", () => {
    expect(filesOutsideScopes(["src/a.ts", "docs/oops.md"], ["src/**"])).toEqual(["docs/oops.md"]);
  });
});
