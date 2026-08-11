import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";

export type ClarificationAnswer = { question: string; answer: string };
export type ParsedClarifications = { open: string[]; answered: ClarificationAnswer[] };

function section(text: string, heading: string, nextHeading?: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = nextHeading ? `(?=^##\\s+${nextHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$)` : "(?![\\s\\S])";
  return text.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)${end}`, "mi"))?.[1]?.trim() ?? "";
}

function questionLines(value: string) {
  return value.split("\n").map((line) => line.trim()).map((line) => {
    if (!line || line.startsWith("_(")) return "";
    return line
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^[-*]\s+(?:Q\s*[:.)-]?\s*)?/i, "")
      .replace(/^###\s+/, "")
      .trim();
  }).filter(Boolean);
}

function answeredBlocks(value: string) {
  if (!value || value.startsWith("_(")) return [];
  const blocks = value.split(/^###\s+/m).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const [question = "", ...answer] = block.split("\n");
    return { question: question.replace(/^Q\s*:\s*/i, "").trim(), answer: answer.join("\n").replace(/^A\s*:\s*/i, "").trim() };
  }).filter((item) => item.question && item.answer);
}

export function parseClarifications(text: string): ParsedClarifications {
  return {
    open: questionLines(section(text, "Open", "Answered")).slice(0, 5),
    answered: answeredBlocks(section(text, "Answered")),
  };
}

export function applyClarificationAnswers(text: string, submitted: ClarificationAnswer[]) {
  const current = parseClarifications(text);
  const byQuestion = new Map(submitted.map((item) => [item.question.trim(), item.answer.trim()]));
  const moved: ClarificationAnswer[] = [];
  const remaining = current.open.filter((question) => {
    const answer = byQuestion.get(question);
    if (!answer) return true;
    moved.push({ question, answer });
    return false;
  });
  const openBody = remaining.length ? remaining.map((question, index) => `${index + 1}. ${question}`).join("\n") : "_(none)_";
  const answered = [...current.answered, ...moved];
  const answeredBody = answered.length ? answered.map((item) => `### ${item.question}\n${item.answer}`).join("\n\n") : "_(none yet)_";
  return `# Clarifications\n\nOpen and answered questions for the project plan. Updated by \`/orchestrate ask\` and the console.\n\n## Open\n\n${openBody}\n\n## Answered\n\n${answeredBody}\n`;
}

function frontmatter(text: string) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { metadata: {} as Record<string, unknown>, body: text };
  return { metadata: (YAML.parse(match[1] ?? "") ?? {}) as Record<string, unknown>, body: text.slice(match[0].length) };
}

export function inspectPlan(text: string) {
  const { metadata, body } = frontmatter(text);
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Project plan";
  const goalSection = body.match(/^##\s+Goal\s*$\n+([\s\S]*?)(?=^##\s+|$)/mi)?.[1]?.trim() ?? "";
  const goal = goalSection.split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  const taskMatches = [...body.matchAll(/^\s*-\s+id:\s*["']?([^\s"']+)["']?\s*$([\s\S]*?)(?=^\s*-\s+id:|^##\s+|(?![\s\S]))/gmi)];
  const scopeWarnings = taskMatches.flatMap((match) => {
    const taskId = match[1] ?? "task";
    const scope = match[2]?.match(/^\s+(?:scope|write_scopes):\s*(.*?)\s*$/mi)?.[1]?.trim();
    return !scope || /^(?:\[\s*\]|null|—|-)$/.test(scope) ? [`${taskId} has no declared scope`] : [];
  });
  const status = String(metadata.status ?? "unknown");
  return {
    title,
    goal,
    version: Number(metadata.version ?? 1),
    status,
    scope_warnings: scopeWarnings,
    can_approve: ["awaiting_approval", "approved"].includes(status) && scopeWarnings.length === 0,
    task_count: taskMatches.length,
    phase_count: [...body.matchAll(/^###\s+Phase\b/gmi)].length,
    text,
  };
}

export function parseJsonLines(text: string) {
  const items: Array<Record<string, unknown>> = [];
  let malformed = 0;
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      const value = JSON.parse(line) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
      items.push(value as Record<string, unknown>);
    } catch { malformed++;
    }
  }
  return { items, malformed };
}

export function classifyRuntimePath(relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("plans/")) return "plans";
  if (normalized.startsWith("commands/")) return "commands";
  if (normalized.startsWith("intake/")) return "intake";
  if (normalized.startsWith("sprints/")) return "sprints";
  if (normalized.startsWith("comms/")) return "comms";
  if (/^control-plane\.db(?:-(?:wal|shm))?$/.test(normalized)) return "control-plane";
  return null;
}

export async function readText(filePath: string, fallback = "") {
  try { return await fsp.readFile(filePath, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function atomicWriteText(filePath: string, contents: string) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await fsp.writeFile(temporary, contents, "utf8");
  await fsp.rename(temporary, filePath);
}
