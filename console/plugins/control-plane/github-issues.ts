import { execFileSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { PlanManifest } from "./contracts";

export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  labels: string[];
};

export type GitHubIssuesClient = {
  listOpenIssues(): Promise<GitHubIssue[]>;
  comment(issueNumber: number, body: string): Promise<void>;
  close(issueNumber: number): Promise<void>;
};

export type GitHubIssuesConfig = {
  schema_version: "1.0";
  enabled: boolean;
  owner: string | null;
  repo: string | null;
  state: "open";
  limit: number;
};

export type IssueTask = PlanManifest["tasks"][number] & {
  github_issue: number;
  github_url: string;
  source: "github_issue";
};

export type SkippedIssue = { github_issue: number; title: string; reason: "missing_scope" };

export type WritebackRecord = {
  kind: "assign" | "done";
  github_issue: number;
  fingerprint: string;
  at: string;
  status: "ok" | "failed";
  diagnostic?: string;
};

type CommandRunner = (args: string[]) => string;

const DEFAULT_CONFIG: GitHubIssuesConfig = {
  schema_version: "1.0",
  enabled: false,
  owner: null,
  repo: null,
  state: "open",
  limit: 100,
};

export function defaultGitHubIssuesConfig(): GitHubIssuesConfig {
  return { ...DEFAULT_CONFIG };
}

export function issuesConfigPath(storeRoot: string) {
  return path.join(storeRoot, "github-issues.yaml");
}

export function skippedIssuesPath(storeRoot: string) {
  return path.join(storeRoot, "issues", "skipped.yaml");
}

export function writebackLogPath(storeRoot: string) {
  return path.join(storeRoot, "issues", "writeback.jsonl");
}

export async function readGitHubIssuesConfig(storeRoot: string): Promise<GitHubIssuesConfig | null> {
  try {
    const parsed = YAML.parse(await fsp.readFile(issuesConfigPath(storeRoot), "utf8")) as Partial<GitHubIssuesConfig> | null;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CONFIG };
    return {
      schema_version: "1.0",
      enabled: parsed.enabled === true,
      owner: parsed.owner ?? null,
      repo: parsed.repo ?? null,
      state: "open",
      limit: Number(parsed.limit ?? 100) || 100,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function parseIssueToTask(issue: GitHubIssue): { task: IssueTask | null; skipped: SkippedIssue | null } {
  const frontmatter = parseFrontmatter(issue.body ?? "");
  const fromFrontmatter = asStringArray(frontmatter.write_scopes ?? frontmatter.scope);
  const fromLabels = issue.labels
    .map((label) => label.match(/^scope[:/](.+)$/i)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const writeScopes = [...new Set([...fromFrontmatter, ...fromLabels])];
  if (!writeScopes.length) {
    return { task: null, skipped: { github_issue: issue.number, title: issue.title, reason: "missing_scope" } };
  }
  const dependsOn = [
    ...asStringArray(frontmatter.depends_on).map(normalizeDep),
    ...[...(issue.body ?? "").matchAll(/depends on #(\d+)/gi)].map((match) => `gh-${match[1]}`),
  ].filter((id, index, all) => all.indexOf(id) === index);
  const task: IssueTask = {
    id: `gh-${issue.number}`,
    name: issue.title,
    title: issue.title,
    goal: firstParagraph(issue.body) || issue.title,
    depends_on: dependsOn,
    write_scopes: writeScopes,
    github_issue: issue.number,
    github_url: issue.html_url,
    source: "github_issue",
  };
  if (typeof frontmatter.agent_id === "string" && frontmatter.agent_id.trim()) task.agent_id = frontmatter.agent_id.trim();
  if (typeof frontmatter.reviewer_agent_id === "string" && frontmatter.reviewer_agent_id.trim()) task.reviewer_agent_id = frontmatter.reviewer_agent_id.trim();
  return { skipped: null, task };
}

export function mergeCreateOnly(manifest: PlanManifest, incoming: IssueTask[]): { manifest: PlanManifest; added: IssueTask[] } {
  const existingIds = new Set(manifest.tasks.map((task) => task.id));
  const existingIssues = new Set(manifest.tasks.map((task) => task.github_issue).filter((value): value is number => typeof value === "number"));
  const added: IssueTask[] = [];
  for (const task of incoming) {
    if (existingIds.has(task.id) || existingIssues.has(task.github_issue)) continue;
    added.push(task);
    existingIds.add(task.id);
    existingIssues.add(task.github_issue);
  }
  return { manifest: { ...manifest, tasks: [...manifest.tasks, ...added] }, added };
}

export function assignmentComment(input: { githubIssue: number; sprintId: string | null; agentId: string; taskId: string }) {
  const sprint = input.sprintId ?? "unassigned";
  return [
    `Sprint \`${sprint}\` assigned to \`${input.agentId}\` (task \`${input.taskId}\`).`,
    `<!-- orchestrate:assign gh-${input.githubIssue} ${sprint} ${input.agentId} -->`,
  ].join("\n");
}

export function doneComment(input: { githubIssue: number; taskId: string; executionId: string }) {
  return [
    `Task \`${input.taskId}\` accepted by the control plane (execution \`${input.executionId}\`). Closing.`,
    `<!-- orchestrate:done gh-${input.githubIssue} ${input.executionId} -->`,
  ].join("\n");
}

export function writebackFingerprint(kind: WritebackRecord["kind"], githubIssue: number, extra: string) {
  return `${kind}:${githubIssue}:${extra}`;
}

export async function readWritebackLog(storeRoot: string): Promise<WritebackRecord[]> {
  try {
    const text = await fsp.readFile(writebackLogPath(storeRoot), "utf8");
    return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as WritebackRecord);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function appendWritebackLog(storeRoot: string, record: WritebackRecord) {
  const file = writebackLogPath(storeRoot);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
}

export function createGhCliClient(options: { owner?: string | null; repo?: string | null; limit?: number; runner?: CommandRunner } = {}): GitHubIssuesClient {
  const runner = options.runner ?? ((args: string[]) => execFileSync("gh", args, { encoding: "utf8", timeout: 30_000, windowsHide: true }));
  const repoFlag = options.owner && options.repo ? ["--repo", `${options.owner}/${options.repo}`] : [];
  return {
    async listOpenIssues() {
      const raw = runner(["issue", "list", ...repoFlag, "--state", "open", "--limit", String(options.limit ?? 100), "--json", "number,title,body,url,labels,state"]);
      const rows = JSON.parse(raw) as Array<{ number: number; title: string; body?: string | null; url: string; state: string; labels?: Array<string | { name: string }> }>;
      return rows.map((row) => ({
        number: row.number,
        title: row.title,
        body: row.body ?? null,
        html_url: row.url,
        state: row.state === "closed" ? "closed" : "open",
        labels: (row.labels ?? []).map((label) => typeof label === "string" ? label : label.name),
      }));
    },
    async comment(issueNumber, body) {
      runner(["issue", "comment", String(issueNumber), ...repoFlag, "--body", body]);
    },
    async close(issueNumber) {
      runner(["issue", "close", String(issueNumber), ...repoFlag, "--reason", "completed"]);
    },
  };
}

function parseFrontmatter(body: string): Record<string, unknown> {
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const parsed = YAML.parse(match[1] ?? "") as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean);
}

function firstParagraph(body: string | null): string {
  if (!body) return "";
  const withoutFrontmatter = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  return withoutFrontmatter.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean)?.replace(/\s+/g, " ") ?? "";
}

function normalizeDep(value: string) {
  const issue = value.match(/#?(\d+)$/);
  if (issue && /^\d+$/.test(issue[1] ?? "")) return `gh-${issue[1]}`;
  return value.startsWith("gh-") ? value : value;
}
