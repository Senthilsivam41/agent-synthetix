import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("Hermes Phase 6 publishing profiles", () => {
  it("implements platform-aware ThreadHermes with hard character limits", () => {
    const profile = read(".agent/rules/hermes/thread/profile.md");
    const platforms = YAML.parse(read(".agent/rules/hermes/thread/platforms.yaml")) as { platforms: Record<string, { max_chars: number; thread_style: string }> };
    expect(profile).not.toContain("Scaffold only");
    expect(Object.keys(platforms.platforms)).toEqual(["x", "linkedin", "bluesky"]);
    expect(platforms.platforms.x).toEqual({ max_chars: 280, thread_style: "numbered" });
    expect(platforms.platforms.linkedin).toEqual({ max_chars: 3000, thread_style: "single_post" });
    expect(profile).toContain("Unicode grapheme");
    expect(profile).toContain("approved: false");
    expect(profile).toContain("Do not post");
  });

  it("implements ReportHermes against the last approved report with safe fallback", () => {
    const profile = read(".agent/rules/hermes/report/profile.md");
    expect(profile).not.toContain("Scaffold only");
    for (const phrase of ["last approved report", "[NEW]", "[CHANGED]", "[REMOVED]", "baseline: true", "diff_mode: lexical", "approved: false"]) {
      expect(profile).toContain(phrase);
    }
    expect(profile).toContain("Never invent metrics");
  });

  it("publishes versioned frontmatter contracts and representative examples", () => {
    const contract = read("schemas/hermes-thread-report.md");
    const entry = read(".agent/rules/hermes.md");
    expect(contract).toContain('schema_version: "1.0"');
    expect(contract).toContain("profile: thread");
    expect(contract).toContain("profile: report");
    expect(entry).toContain("/hermes thread <source>");
    expect(entry).toContain("/hermes report <source>");
    const threadExample = read(".agent/rules/hermes/thread/examples/sample-pending.md");
    expect(threadExample).toContain("profile: thread");
    const renderedPosts = threadExample.split(/^## Post \d+\/\d+$/m).slice(1).map((post) => post.trim());
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    for (const post of renderedPosts) expect([...segmenter.segment(post)].length).toBeLessThanOrEqual(280);
    expect(read(".agent/rules/hermes/report/examples/sample-pending.md")).toContain("profile: report");
  });
});
