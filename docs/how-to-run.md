# How to run agent-synthetix locally

## Two local interfaces

Commands like `/orchestrate init` are **agent-chat commands**, not shell commands. Typing `orchestrate init` in a terminal still fails. For kernel-enforced execution, the console package now provides a separate headless command.

The compatibility runtime is an AI agent chat that reads [`.agent/rules/`](../.agent/rules/) and writes gitignored state under `.autoclaw/`. The authoritative execution kernel lives in [`console/`](../console/) and uses SQLite WAL, Git worktrees, scope leases, evidence gates, and independent review.

## Run the enforced control plane

Node 22.13 or newer is required.

```bash
cd console
npm install
npm run control-plane -- init --workspace ..
npm run dev
```

Open `http://localhost:5173`. Keep the console localhost-only. See the [control-plane guide](./control-plane.md) for registration, planning, execution, and review commands.

---

## Run in Cursor (recommended)

1. Open this folder as a workspace in **Cursor**.
2. Open **Agent / Chat** (not the Terminal panel).
3. Paste one of these messages:

```text
/orchestrate init
```

or, if slash-commands are ignored by your host:

```text
Read .agent/rules/orchestrate.md and run the init sub-command:
create .autoclaw/orchestrator/config.yaml plus manifests/, sprints/, reviews/, and logs/.
```

4. Check that these exist in the file tree:
   - `.autoclaw/orchestrator/config.yaml`
   - `.autoclaw/orchestrator/manifests/`
5. Edit or keep `manifests/example-manifest.yaml`, then in **chat**:

```text
/orchestrate plan
```

6. Then:

```text
/orchestrate status
```

---

## What “success” looks like

| You typed in | Result |
|---|---|
| Terminal: `orchestrate init` | Fails — expected |
| Agent chat: `/orchestrate init` | Creates advisory compatibility state |
| Terminal in `console/`: `npm run control-plane -- init --workspace ..` | Initializes the authoritative local store |
| `git status` after init | Usually clean — `.autoclaw/` is gitignored |

---

## Other hosts

Same idea in Claude Code, Windsurf, Copilot Chat, etc.: send the command as a **chat message** to the agent that has access to this workspace and the rule files under `.agent/rules/`.

---

## Next compatibility commands (in agent chat)

```text
/orchestrate plan
/orchestrate assign 1
/orchestrate status
/kdream start
/learn
/index-code
```

See [README Quick Start](../README.md#quick-start) and [`.autoclaw` / KDream policy](./autoclaw-and-kdream.md).
