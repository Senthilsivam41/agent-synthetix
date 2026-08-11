import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks } from "../src/lib/markdown";

describe("safe Markdown block parser", () => {
  it("creates semantic blocks without interpreting raw HTML", () => {
    const blocks = parseMarkdownBlocks("# Plan\n\n## Goal\nShip safely.\n\n- One\n- Two\n\n<script>alert(1)</script>");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "heading", "paragraph", "list", "paragraph"]);
    expect(blocks.at(-1)).toMatchObject({ text: "<script>alert(1)</script>" });
  });
});
