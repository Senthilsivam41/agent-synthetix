import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin, Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ControlPlaneKernel } from "./control-plane/kernel";
import { WorkspaceLock } from "./control-plane/store";

type Options = { workspaceRoot: string };

function orchRoot(workspaceRoot: string) {
  return path.join(workspaceRoot, ".autoclaw", "orchestrator");
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function inferType(name: string): string {
  const lower = name.toLowerCase();
  if (/\.(md|txt|markdown)$/.test(lower)) return "text";
  if (/\.pdf$/.test(lower)) return "pdf";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) return "image";
  if (/\.(mp3|wav|m4a|ogg|webm|aac)$/.test(lower)) return "audio";
  return "other";
}

async function ensureCommands(root: string) {
  const dir = path.join(root, "commands");
  await fs.mkdir(dir, { recursive: true });
  for (const f of ["pending.jsonl", "processed.jsonl"]) {
    const p = path.join(dir, f);
    try {
      await fs.access(p);
    } catch {
      await fs.writeFile(p, "", "utf8");
    }
  }
}

export function orchestratorFsApi(opts: Options): Plugin {
  const root = orchRoot(opts.workspaceRoot);
  let kernel: ControlPlaneKernel | null = null;
  let ready: Promise<unknown> | null = null;
  let lock: WorkspaceLock | null = null;

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith("/api/orchestrator")) return next();

    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = url.pathname;

      if (pathname.startsWith("/api/orchestrator/v1/")) {
        if (!kernel || !ready) throw new Error("control-plane kernel is not initialized");
        await ready;

        if (req.method === "GET" && pathname === "/api/orchestrator/v1/status") {
          return sendJson(res, 200, kernel.status());
        }
        if (req.method === "POST" && pathname === "/api/orchestrator/v1/agents") {
          return sendJson(res, 201, kernel.registerAgent(JSON.parse(await readBody(req))));
        }
        if (req.method === "POST" && pathname === "/api/orchestrator/v1/sessions") {
          const body = JSON.parse(await readBody(req)) as { agent_id: string; ttl_seconds?: number };
          return sendJson(res, 201, kernel.createSession(body.agent_id, body.ttl_seconds));
        }
        if (req.method === "POST" && pathname === "/api/orchestrator/v1/plans/validate") {
          const body = JSON.parse(await readBody(req)) as { manifest: string };
          return sendJson(res, 200, await kernel.plan(body.manifest));
        }
        if (req.method === "POST" && pathname === "/api/orchestrator/v1/executions") {
          const body = JSON.parse(await readBody(req)) as { assignment_id: string; session_id?: string };
          const assignment = kernel.assignment(body.assignment_id);
          const sessionId = body.session_id ?? kernel.activeSessionForAgent(assignment.assigned_agent_id).session_id;
          return sendJson(res, 202, await kernel.run(body.assignment_id, sessionId));
        }
        const executionMatch = pathname.match(/^\/api\/orchestrator\/v1\/executions\/([^/]+)$/);
        if (req.method === "GET" && executionMatch) return sendJson(res, 200, kernel.execution(decodeURIComponent(executionMatch[1]!)));
        const cancelMatch = pathname.match(/^\/api\/orchestrator\/v1\/executions\/([^/]+)\/cancel$/);
        if (req.method === "POST" && cancelMatch) return sendJson(res, 200, kernel.cancel(decodeURIComponent(cancelMatch[1]!)));
        const retryMatch = pathname.match(/^\/api\/orchestrator\/v1\/executions\/([^/]+)\/retry$/);
        if (req.method === "POST" && retryMatch) {
          const body = JSON.parse((await readBody(req)) || "{}") as { session_id?: string };
          return sendJson(res, 202, await kernel.retry(decodeURIComponent(retryMatch[1]!), body.session_id));
        }
        if (req.method === "POST" && pathname === "/api/orchestrator/v1/events/ingest") return sendJson(res, 200, await kernel.ingestEvent(JSON.parse(await readBody(req))));
        if (req.method === "POST" && pathname === "/api/orchestrator/v1/inbox/ingest") return sendJson(res, 200, await kernel.ingest());
        if (req.method === "POST" && pathname === "/api/orchestrator/v1/verdicts") return sendJson(res, 200, await kernel.ingestVerdict(JSON.parse(await readBody(req))));
        if (req.method === "GET" && pathname === "/api/orchestrator/v1/findings") return sendJson(res, 200, { findings: kernel.status().findings });
        const evidenceMatch = pathname.match(/^\/api\/orchestrator\/v1\/executions\/([^/]+)\/evidence$/);
        if (req.method === "GET" && evidenceMatch) {
          const executionId = decodeURIComponent(evidenceMatch[1]!);
          const rows = kernel.store.db.prepare("SELECT evidence_json FROM evidence WHERE execution_id=? ORDER BY created_at").all(executionId) as Array<{ evidence_json: string }>;
          return sendJson(res, 200, { evidence: rows.map((row) => JSON.parse(row.evidence_json)) });
        }
        const artifactMatch = pathname.match(/^\/api\/orchestrator\/v1\/executions\/([^/]+)\/artifacts$/);
        if (req.method === "GET" && artifactMatch) {
          const executionId = decodeURIComponent(artifactMatch[1]!);
          const manifestPath = path.join(root, "artifacts", executionId, "artifact-manifest.json");
          return sendJson(res, 200, JSON.parse(await fs.readFile(manifestPath, "utf8")));
        }
        return sendJson(res, 404, { error: "v1 endpoint not found" });
      }

      if (req.method === "GET" && pathname === "/api/orchestrator/status") {
        const statusPath = path.join(root, "plans", "status.yaml");
        let text = "";
        try {
          text = await fs.readFile(statusPath, "utf8");
        } catch {
          text = "status: collecting\n";
        }
        return sendJson(res, 200, { path: "plans/status.yaml", text });
      }

      if (req.method === "GET" && pathname === "/api/orchestrator/intake") {
        const intakeDir = path.join(root, "intake");
        await fs.mkdir(intakeDir, { recursive: true });
        const entries = await fs.readdir(intakeDir);
        const files = entries
          .filter((n) => n !== "INDEX.md" && !n.startsWith("."))
          .map((name) => ({ name, type: inferType(name) }));
        let index = "";
        try {
          index = await fs.readFile(path.join(intakeDir, "INDEX.md"), "utf8");
        } catch {
          index = "";
        }
        return sendJson(res, 200, { files, index });
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/intake/index") {
        const intakeDir = path.join(root, "intake");
        await fs.mkdir(intakeDir, { recursive: true });
        const entries = await fs.readdir(intakeDir);
        const files = entries.filter((n) => n !== "INDEX.md" && !n.startsWith("."));
        const rows = files.length
          ? files
              .map((name) => `| ${name} | ${inferType(name)} | — | — |`)
              .join("\n")
          : "| _(none yet)_ | — | — | Drop files here |";
        const index = `# Intake INDEX\n\n| File | Type | Added | Notes |\n|---|---|---|---|\n${rows}\n`;
        await fs.writeFile(path.join(intakeDir, "INDEX.md"), index, "utf8");
        return sendJson(res, 200, { ok: true, count: files.length, index });
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/intake/upload") {
        const body = JSON.parse(await readBody(req)) as {
          name: string;
          contentBase64: string;
        };
        if (!body.name || body.contentBase64 == null) {
          return sendJson(res, 400, { error: "name and contentBase64 required" });
        }
        const safe = path.basename(body.name).replace(/[^a-zA-Z0-9._-]/g, "_");
        const intakeDir = path.join(root, "intake");
        await fs.mkdir(intakeDir, { recursive: true });
        await fs.writeFile(
          path.join(intakeDir, safe),
          Buffer.from(body.contentBase64, "base64"),
        );
        return sendJson(res, 200, { ok: true, name: safe });
      }

      if (req.method === "GET" && pathname === "/api/orchestrator/plan") {
        const planPath = path.join(root, "plans", "project-plan.md");
        let text = "";
        try {
          text = await fs.readFile(planPath, "utf8");
        } catch {
          text = "";
        }
        return sendJson(res, 200, { exists: Boolean(text), text });
      }

      if (req.method === "GET" && pathname === "/api/orchestrator/clarifications") {
        const p = path.join(root, "plans", "clarifications.md");
        let text = "";
        try {
          text = await fs.readFile(p, "utf8");
        } catch {
          text = "";
        }
        return sendJson(res, 200, { text });
      }

      if (req.method === "GET" && pathname === "/api/orchestrator/sprints") {
        const sprintsDir = path.join(root, "sprints");
        await fs.mkdir(sprintsDir, { recursive: true });
        const entries = await fs.readdir(sprintsDir);
        const yamls = entries.filter((n) => /^sprint-\d+\.yaml$/.test(n)).sort();
        const sprints = [];
        for (const name of yamls) {
          const text = await fs.readFile(path.join(sprintsDir, name), "utf8");
          sprints.push({ name, text });
        }
        let summary = "";
        try {
          summary = await fs.readFile(path.join(sprintsDir, "plan-summary.yaml"), "utf8");
        } catch {
          summary = "";
        }
        return sendJson(res, 200, { sprints, summary });
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/commands") {
        await ensureCommands(root);
        const body = JSON.parse(await readBody(req)) as {
          command: string;
          args?: Record<string, unknown>;
        };
        if (!body.command?.startsWith("/orchestrate")) {
          return sendJson(res, 400, {
            error: 'command must start with "/orchestrate"',
          });
        }
        const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const line = JSON.stringify({
          id,
          command: body.command,
          args: body.args ?? {},
          enqueued_at: new Date().toISOString(),
        });
        const pending = path.join(root, "commands", "pending.jsonl");
        await fs.appendFile(pending, `${line}\n`, "utf8");
        await kernel?.recordCommand(body.command, body.args ?? {}, "pending", id);
        return sendJson(res, 200, { ok: true, id, queued: body.command });
      }

      if (req.method === "GET" && pathname === "/api/orchestrator/commands/pending") {
        await ensureCommands(root);
        const text = await fs.readFile(
          path.join(root, "commands", "pending.jsonl"),
          "utf8",
        );
        const items = text
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        return sendJson(res, 200, { items });
      }

      return sendJson(res, 404, { error: "not found" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return sendJson(res, 500, { error: message });
    }
  };

  return {
    name: "orchestrator-fs-api",
    configureServer(server) {
      lock = new WorkspaceLock(root);
      lock.acquire("vite-console");
      kernel = new ControlPlaneKernel(opts.workspaceRoot);
      ready = kernel.init();
      server.middlewares.use(handler);
      server.httpServer?.once("close", () => {
        kernel?.close();
        kernel = null;
        lock?.release();
        lock = null;
      });
    },
  };
}
