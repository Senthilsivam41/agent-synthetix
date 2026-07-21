# How to run agent-synthetix locally

## Important: there is no terminal CLI

Commands like `/orchestrate init` are **not shell commands**.  
Typing them in a terminal will always fail (`command not found`).

This repo has:

- no `package.json`
- no binary / npm script
- no server to start

The “runtime” is an **AI agent chat** that reads [`.agent/rules/`](../.agent/rules/) and writes state under `.autoclaw/` (gitignored).

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
| Agent chat: `/orchestrate init` | Creates `.autoclaw/orchestrator/...` |
| `git status` after init | Usually clean — `.autoclaw/` is gitignored |

---

## Other hosts

Same idea in Claude Code, Windsurf, Copilot Chat, etc.: send the command as a **chat message** to the agent that has access to this workspace and the rule files under `.agent/rules/`.

---

## Next commands (always in agent chat)

```text
/orchestrate plan
/orchestrate assign 1
/orchestrate status
/kdream start
/learn
/index-code
```

See [README Quick Start](../README.md#quick-start) and [`.autoclaw` / KDream policy](./autoclaw-and-kdream.md).
