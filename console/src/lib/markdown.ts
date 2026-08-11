export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "code"; text: string };

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const text = source.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
  const lines = text.split("\n");
  const blocks: MarkdownBlock[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]?.trim() ?? "";
    if (!line) { index++; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length as 1 | 2 | 3, text: heading[2]!.trim() });
      index++; continue;
    }
    if (line.startsWith("```")) {
      const content: string[] = []; index++;
      while (index < lines.length && !(lines[index]?.trim() ?? "").startsWith("```")) content.push(lines[index++] ?? "");
      if (index < lines.length) index++;
      blocks.push({ kind: "code", text: content.join("\n") });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index]?.trim() ?? "")) items.push((lines[index++]?.trim() ?? "").replace(/^[-*]\s+/, ""));
      blocks.push({ kind: "list", items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index]?.trim() ?? "";
      if (!candidate || /^(?:#{1,3}\s+|[-*]\s+|```)/.test(candidate)) break;
      paragraph.push(candidate); index++;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }
  return blocks;
}
