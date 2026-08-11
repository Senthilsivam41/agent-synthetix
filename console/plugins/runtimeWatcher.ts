import { watch, type FSWatcher } from "node:fs";
import { classifyRuntimePath } from "./orchestratorFiles";

export class CoalescedRuntimeChanges {
  private readonly areas = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(private readonly emit: (areas: string[]) => void, private readonly delayMs = 100) {}

  note(relativePath: string) {
    if (this.closed) return;
    const area = classifyRuntimePath(relativePath);
    if (!area) return;
    this.areas.add(area);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.areas.clear();
  }

  private flush() {
    this.timer = null;
    if (this.closed || this.areas.size === 0) return;
    const areas = [...this.areas].sort();
    this.areas.clear();
    this.emit(areas);
  }
}

export class RuntimeFileWatcher {
  private watcher: FSWatcher | null = null;
  private readonly changes: CoalescedRuntimeChanges;

  constructor(private readonly root: string, emit: (areas: string[]) => void) {
    this.changes = new CoalescedRuntimeChanges(emit);
  }

  start() {
    if (this.watcher) return;
    this.watcher = watch(this.root, { recursive: true }, (_event, filename) => {
      if (filename) this.changes.note(String(filename));
    });
  }

  close() {
    this.watcher?.close();
    this.watcher = null;
    this.changes.close();
  }
}
