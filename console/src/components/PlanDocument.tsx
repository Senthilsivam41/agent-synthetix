import { parseMarkdownBlocks } from "../lib/markdown";

export function PlanDocument({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);
  return (
    <article className="plan-document">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "heading") {
          if (block.level === 1) return <h2 key={key}>{block.text}</h2>;
          if (block.level === 2) return <h3 key={key}>{block.text}</h3>;
          return <h4 key={key}>{block.text}</h4>;
        }
        if (block.kind === "list") return <ul key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{item}</li>)}</ul>;
        if (block.kind === "code") return <pre key={key}><code>{block.text}</code></pre>;
        return <p key={key}>{block.text}</p>;
      })}
    </article>
  );
}
