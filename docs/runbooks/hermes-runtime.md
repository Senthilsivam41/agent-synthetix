# Hermes runtime compatibility and rollback

H0 keeps Hermes runtime lifecycle separate from the agent-synthetix console. The compatibility command is read-only; the runtime manifest records an isolated candidate and active executable without installing or replacing Hermes.

## Inspect

```bash
cd console
npm run hermes:compat -- --executable hermes
```

The command reports `missing`, `incompatible`, `supported`, or `untested` against the pinned target `0.20.0` / release `v2026.8.3`. It captures only `--version` and `--help` output, derives transport capabilities, and stores a SHA-256 fingerprint in the returned JSON. It does not read `.env`, provider credentials, session data, or memory.

The current installed runtime can remain older or untested while the adapter is disabled. A runtime is not enabled merely because the executable is present.

## Prepare and activate an isolated candidate

The commands below update only `.autoclaw/orchestrator/hermes-runtime.json` and create the selected profile directory. They do not run a remote installer or overwrite the existing Hermes home.

```bash
cd console
npm run hermes:runtime -- prepare \
  --workspace .. \
  --executable /absolute/path/to/pinned/hermes \
  --profile-home /absolute/path/to/isolated/hermes-profile

npm run hermes:runtime -- activate --workspace ..
npm run hermes:runtime -- show --workspace ..
```

The operator is responsible for installing the pinned runtime into the candidate path using the upstream installation/development procedure, then running `hermes doctor` and the H0/H1 conformance checks. Keep the existing profile and executable untouched until those checks pass.

## Roll back

```bash
cd console
npm run hermes:runtime -- rollback --workspace ..
npm run hermes:runtime -- show --workspace ..
```

Rollback swaps the active and previous executable references atomically in the manifest and does not modify the control-plane database. If there is no previous active runtime, rollback fails closed.

## Safety rules

- Pin a reviewed release; never use an unqualified `latest` executable for a managed run.
- Keep Hermes state isolated with a dedicated profile home. The profile is separate from the Git worktree. The H2 adapter sets `cwd` to the kernel-created execution worktree and records that path on the completion contract.
- Do not place API keys in command arguments or the runtime manifest.
- Do not enable the Hermes adapter until a pinned 0.20.0 runtime passes live worktree conformance and human review. Fixture tests are not enablement.

## H2 local worktree slice

H2 translates a kernel `TaskAssignment` into an immutable completion contract (outcome, verification, constraints, boundaries, `stop_when`) and talks to the worker over stdio JSON-RPC from that worktree. PID, version, external run/session IDs, timing, and termination reason are stored on `external_runs` (database migration 3) and as `artifacts/<execution-id>/hermes-completion-contract.json`.

The adapter still refuses to start unless `control-plane.config.json` has `mode: "hermes"` **and** `hermes_enabled: true`. Built-in registration health is `unavailable`. CI uses `console/plugins/control-plane/fixtures/hermes-jsonrpc-fixture.mjs` via Node, not a live Hermes binary.

```bash
cd console
npm test
HERMES_LIVE_SMOKE=1 npm run smoke:hermes:live
```

The live smoke command no-ops unless `HERMES_LIVE_SMOKE=1` and `inspectHermesRuntime` reports the pinned `0.20.0` / `v2026.8.3` release. It does not change default adapter configuration.
