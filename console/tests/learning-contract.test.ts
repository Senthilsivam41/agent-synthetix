import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

type Source = {
  id: string;
  consent: "default" | "opt_in";
  format: string;
  locations: string[];
  kept_signal: "git_evidence" | "manual" | "native_and_git";
  unsupported_behavior: "unavailable" | "export_required" | "fail_closed";
};

function sourceContract() {
  const text = readFileSync(path.join(repositoryRoot, ".agent/rules/intelligence/sources.yaml"), "utf8");
  return YAML.parse(text) as { schema_version: string; sources: Source[] };
}

describe("Phase 4 learning source contract", () => {
  it("declares every supported tool with explicit consent and failure behavior", () => {
    const contract = sourceContract();
    expect(contract.schema_version).toBe("1.0");
    expect(contract.sources.map((source) => source.id)).toEqual([
      "autoclaw", "claude_code", "claude_desktop", "cursor", "kiro", "gemini",
    ]);
    expect(contract.sources.find((source) => source.id === "autoclaw")?.consent).toBe("default");
    for (const source of contract.sources.filter((item) => item.id !== "autoclaw")) expect(source.consent).toBe("opt_in");
    for (const source of contract.sources) expect(source.unsupported_behavior).toMatch(/unavailable|export_required|fail_closed/);
  });

  it("uses verified local formats and never treats proprietary stores as generic text", () => {
    const sources = new Map(sourceContract().sources.map((source) => [source.id, source]));
    expect(sources.get("claude_code")?.locations).toContain("~/.claude/projects/**/*.jsonl");
    expect(sources.get("cursor")?.format).toBe("cursor_sqlite");
    expect(sources.get("kiro")?.locations).toContain("~/.kiro/sessions/cli/*.jsonl");
    expect(sources.get("gemini")?.locations).toContain("~/.gemini/tmp/*/chats/session-*.jsonl");
    expect(sources.get("claude_desktop")?.unsupported_behavior).toBe("export_required");
  });

  it("documents provenance, watermarking, redaction, and unknown-as-default classification", () => {
    const rule = readFileSync(path.join(repositoryRoot, ".agent/rules/intelligence.md"), "utf8");
    const schema = readFileSync(path.join(repositoryRoot, "schemas/learning-insight.md"), "utf8");
    for (const phrase of ["classification: unknown", "source_session_id", "content_fingerprint", "redact", "watermark"]) {
      expect(`${rule}\n${schema}`).toContain(phrase);
    }
  });
});
