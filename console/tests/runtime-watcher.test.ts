import { afterEach, describe, expect, it, vi } from "vitest";
import { CoalescedRuntimeChanges } from "../plugins/runtimeWatcher";

afterEach(() => vi.useRealTimers());

describe("runtime change coalescing", () => {
  it("emits one stable invalidation for a burst of relevant paths", () => {
    vi.useFakeTimers();
    const emitted: string[][] = [];
    const changes = new CoalescedRuntimeChanges((areas) => emitted.push(areas), 50);
    changes.note("plans/project-plan.md");
    changes.note("plans/status.yaml");
    changes.note("commands/pending.jsonl");
    changes.note("logs/noise.log");
    vi.advanceTimersByTime(49);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(emitted).toEqual([["commands", "plans"]]);
    changes.close();
  });

  it("does not emit after close", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const changes = new CoalescedRuntimeChanges(emit, 10);
    changes.note("sprints/sprint-1.yaml");
    changes.close();
    vi.runAllTimers();
    expect(emit).not.toHaveBeenCalled();
  });
});
