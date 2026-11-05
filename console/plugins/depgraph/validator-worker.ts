import fs from "node:fs";
import path from "node:path";
import { admitDependencyEdge, holdValidatorRebuild } from "./validator";

function waitForRelease(entered: string, release: string) {
  fs.mkdirSync(path.dirname(entered), { recursive: true });
  fs.writeFileSync(entered, String(process.pid));
  const deadline = Date.now() + 15_000;
  while (!fs.existsSync(release)) {
    if (Date.now() > deadline) throw new Error("validator hold timed out");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
}

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
  workspace: string;
  mode: "rebuild-hold" | "admit" | "admit-hold-commit" | "admit-recover";
  request?: unknown;
  entered?: string;
  release?: string;
};

const hold = payload.entered && payload.release
  ? () => waitForRelease(payload.entered as string, payload.release as string)
  : undefined;

const result = payload.mode === "rebuild-hold"
  ? holdValidatorRebuild(payload.workspace, hold ? { duringRebuild: hold } : undefined)
  : admitDependencyEdge({
    workspace: payload.workspace,
    request: payload.request,
    hooks: payload.mode === "admit-hold-commit"
      ? { beforeCommit: hold }
      : payload.mode === "admit-recover"
        ? { duringRebuild: hold }
        : undefined,
  });
process.stdout.write(JSON.stringify(result));
