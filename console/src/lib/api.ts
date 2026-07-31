export type IntakeFile = { name: string; type: string };

async function json<T>(resPromise: Promise<Response>): Promise<T> {
  const res = await resPromise;
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () =>
    json<{ path: string; text: string }>(fetch("/api/orchestrator/status")),

  intake: () =>
    json<{ files: IntakeFile[]; index: string }>(
      fetch("/api/orchestrator/intake"),
    ),

  indexIntake: () =>
    json<{ ok: boolean; count: number; index: string }>(
      fetch("/api/orchestrator/intake/index", { method: "POST" }),
    ),

  uploadIntake: async (file: File) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const contentBase64 = btoa(binary);
    return json<{ ok: boolean; name: string }>(
      fetch("/api/orchestrator/intake/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, contentBase64 }),
      }),
    );
  },

  enqueueCommand: (command: string, args: Record<string, unknown> = {}) =>
    json<{ ok: boolean; id: string; queued: string }>(
      fetch("/api/orchestrator/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, args }),
      }),
    ),

  pendingCommands: () =>
    json<{ items: Array<{ id: string; command: string }> }>(
      fetch("/api/orchestrator/commands/pending"),
    ),
};
