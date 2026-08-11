// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

class EventSourceStub {
  addEventListener() {}
  close() {}
}

function response(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
}

function contrast(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex.match(/../g)!.map((value) => Number.parseInt(value, 16) / 255).map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("console accessibility", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", EventSourceStub);
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/status")) return response({ text: "status: collecting\n" });
      if (url.endsWith("/commands/pending")) return response({ items: [] });
      if (url.endsWith("/commands/activity")) return response({ pending: { items: [], malformed: 0 }, processed: { items: [], malformed: 0 } });
      if (url.endsWith("/intake")) return response({ files: [], index: "" });
      if (url.endsWith("/clarifications")) return response({ text: "", open: [], answered: [] });
      return response({});
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("has no automated WCAG A/AA violations in the primary shell", async () => {
    const { container } = render(<App />);
    await screen.findByText(/Drop a brief/);
    const results = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("keeps every primary text token above WCAG AA normal-text contrast", () => {
    const pairs = [
      ["e8eef4", "0f1419"], ["9aa8b5", "0f1419"], ["9aa8b5", "1c2430"],
      ["2ec4b6", "0f1419"], ["e35d6a", "0f1419"], ["3dbf7a", "0f1419"], ["06221f", "2ec4b6"],
    ];
    for (const [foreground, background] of pairs) expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
  });

  it("offers skip navigation and moves focus to the selected workflow panel", async () => {
    render(<App />);
    const skip = screen.getByRole("link", { name: /skip to workflow/i });
    expect(skip.getAttribute("href")).toBe("#workflow-main");
    fireEvent.click(screen.getByRole("button", { name: "Clarify" }));
    await screen.findByRole("heading", { name: "Clarify" });
    await waitFor(() => expect(document.activeElement?.id).toBe("workflow-main"));
  });

  it("provides a keyboard-operable alternative to drag and drop", async () => {
    render(<App />);
    await screen.findByText(/Drop a brief/);
    expect(screen.getByRole("button", { name: /choose files/i })).toBeTruthy();
    expect(screen.getByRole("table", { name: /intake files/i })).toBeTruthy();
  });
});
