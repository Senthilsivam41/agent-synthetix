import { EdgeLog, type EdgeLogCommand } from "./edge-log";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
  workspace: string;
  command: EdgeLogCommand;
  request: unknown;
};

const log = new EdgeLog(payload.workspace);
try {
  const result = payload.command === "claim"
    ? log.claim(payload.request)
    : payload.command === "add"
      ? log.add(payload.request)
      : payload.command === "remove"
        ? log.remove(payload.request)
        : log.dependents(payload.request);
  process.stdout.write(JSON.stringify(result));
} finally {
  log.close();
}
