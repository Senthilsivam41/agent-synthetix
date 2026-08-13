import { describe, expect, it } from "vitest";
import {
  assignmentComment,
  createGhCliClient,
  doneComment,
  mergeCreateOnly,
  parseIssueToTask,
  writebackFingerprint,
  type GitHubIssue,
} from "../plugins/control-plane/github-issues";

const issue = (overrides: Partial<GitHubIssue> = {}): GitHubIssue => ({
  number: 42,
  title: "Add left module",
  body: "---\nwrite_scopes:\n  - src/left/**\ndepends_on:\n  - \"#7\"\n---\n\nShip the left module.\n",
  html_url: "https://github.com/acme/demo/issues/42",
  state: "open",
  labels: [],
  ...overrides,
});

describe("GitHub Issues create-only mapping", () => {
  it("maps frontmatter scopes and depends_on into a gh- prefixed task", () => {
    const { task, skipped } = parseIssueToTask(issue({
      body: "---\nwrite_scopes:\n  - src/left/**\ndepends_on:\n  - \"#7\"\nagent_id: worker\nreviewer_agent_id: reviewer\n---\n\nShip the left module.\n",
    }));
    expect(skipped).toBeNull();
    expect(task).toMatchObject({
      id: "gh-42",
      github_issue: 42,
      source: "github_issue",
      write_scopes: ["src/left/**"],
      depends_on: ["gh-7"],
      goal: "Ship the left module.",
      agent_id: "worker",
      reviewer_agent_id: "reviewer",
    });
  });

  it("accepts scope labels and depends-on body text when frontmatter is absent", () => {
    const { task } = parseIssueToTask(issue({
      body: "Please implement this.\n\nDepends on #9\n",
      labels: ["scope:src/right/**", "bug"],
    }));
    expect(task?.write_scopes).toEqual(["src/right/**"]);
    expect(task?.depends_on).toEqual(["gh-9"]);
  });

  it("skips issues that have no parseable write scope", () => {
    const { task, skipped } = parseIssueToTask(issue({ body: "No scope here", labels: ["bug"] }));
    expect(task).toBeNull();
    expect(skipped).toEqual({ github_issue: 42, title: "Add left module", reason: "missing_scope" });
  });

  it("adds only new issues and never overwrites an existing task", () => {
    const first = parseIssueToTask(issue())!.task!;
    const renamed = { ...first, name: "Changed on GitHub", title: "Changed on GitHub", write_scopes: ["src/other/**"] };
    const merged = mergeCreateOnly({ tasks: [{ id: "gh-42", name: "Keep me", github_issue: 42, write_scopes: ["src/left/**"] }] }, [renamed, parseIssueToTask(issue({ number: 99, title: "New", html_url: "https://github.com/acme/demo/issues/99" }))!.task!]);
    expect(merged.added.map((task) => task.id)).toEqual(["gh-99"]);
    expect(merged.manifest.tasks[0]).toMatchObject({ id: "gh-42", name: "Keep me", write_scopes: ["src/left/**"] });
  });

  it("builds idempotent write-back comments without rewriting issue bodies", () => {
    expect(assignmentComment({ githubIssue: 42, sprintId: "sprint-1", agentId: "WA-1", taskId: "gh-42" })).toContain("<!-- orchestrate:assign gh-42 sprint-1 WA-1 -->");
    expect(doneComment({ githubIssue: 42, taskId: "gh-42", executionId: "exec-1" })).toContain("<!-- orchestrate:done gh-42 exec-1 -->");
    expect(writebackFingerprint("done", 42, "exec-1")).toBe("done:42:exec-1");
  });

  it("uses gh issue list/comment/close and never edits the issue body", () => {
    const calls: string[][] = [];
    const client = createGhCliClient({
      owner: "acme",
      repo: "demo",
      runner: (args) => {
        calls.push(args);
        if (args[0] === "issue" && args[1] === "list") return JSON.stringify([{ number: 1, title: "T", body: "", url: "https://github.com/acme/demo/issues/1", state: "open", labels: [{ name: "scope:src/**" }] }]);
        return "";
      },
    });
    return Promise.all([client.listOpenIssues(), client.comment(1, "hi"), client.close(1)]).then(([listed]) => {
      expect(listed[0]?.labels).toEqual(["scope:src/**"]);
      expect(calls.map((args) => args.slice(0, 2))).toEqual([["issue", "list"], ["issue", "comment"], ["issue", "close"]]);
      expect(calls.some((args) => args.includes("edit"))).toBe(false);
    });
  });
});
