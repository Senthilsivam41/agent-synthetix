#!/usr/bin/env node
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const mode = process.env.HERMES_FIXTURE_MODE ?? "success";
const writes = JSON.parse(process.env.HERMES_FIXTURE_WRITES ?? "{}");
let startId = null;
const runId = "ext-run-fixture";
const sessionId = "ext-session-fixture";

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function finish(code = 0) {
  setImmediate(() => process.exit(code));
}

async function applyWrites() {
  for (const [relative, contents] of Object.entries(writes)) {
    const target = path.resolve(process.cwd(), relative);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, contents, "utf8");
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (mode === "malformed") {
    process.stdout.write("not-jsonrpc\n");
    finish(0);
    return;
  }
  let message;
  try { message = JSON.parse(line); } catch { process.stdout.write("not-jsonrpc\n"); finish(0); return; }
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocol: "synthetix-hermes-jsonrpc/1", version: "0.20.0", cwd: process.cwd() } });
    return;
  }
  if (message.method === "run.start") {
    startId = message.id;
    if (mode === "crash") {
      process.exit(2);
      return;
    }
    if (mode === "timeout") {
      await applyWrites();
      return;
    }
    send({ jsonrpc: "2.0", method: "run.started", params: { run_id: runId, session_id: sessionId, version: "0.20.0", cwd: process.cwd() } });
    if (mode === "secret") {
      send({ jsonrpc: "2.0", id: startId, result: { status: "completed", run_id: runId, session_id: sessionId, leaked: process.env.SYNTHETIX_TEST_SECRET ?? "" } });
      finish(0);
      return;
    }
    if (mode === "approval") {
      send({ jsonrpc: "2.0", method: "run.approval_required", params: { request_id: "appr-1", run_id: runId } });
      return;
    }
    await applyWrites();
    send({ jsonrpc: "2.0", id: startId, result: { status: "completed", run_id: runId, session_id: sessionId, version: "0.20.0", cwd: process.cwd() } });
    finish(0);
    return;
  }
  if (message.method === "run.approve") {
    if (message.params?.decision === "deny") {
      send({ jsonrpc: "2.0", id: message.id, result: { status: "denied" } });
      if (startId !== null) send({ jsonrpc: "2.0", id: startId, result: { status: "failed", run_id: runId, failure: "approval_denied" } });
      finish(0);
      return;
    }
    await applyWrites();
    send({ jsonrpc: "2.0", id: message.id, result: { status: "approved" } });
    if (startId !== null) send({ jsonrpc: "2.0", id: startId, result: { status: "completed", run_id: runId, session_id: sessionId, version: "0.20.0", cwd: process.cwd() } });
    finish(0);
    return;
  }
  if (message.method === "run.cancel") {
    send({ jsonrpc: "2.0", id: message.id, result: { status: "cancelled" } });
    finish(0);
  }
});
