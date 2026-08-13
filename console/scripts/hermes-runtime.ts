#!/usr/bin/env node
import path from "node:path";
import { activateHermesRuntime, prepareHermesRuntime, readHermesRuntimeManifest, rollbackHermesRuntime } from "../plugins/control-plane/hermes-compatibility";

function flag(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2] ?? "show";
const workspace = path.resolve(flag("workspace") ?? process.cwd());
const manifestPath = path.resolve(flag("manifest") ?? path.join(workspace, ".autoclaw", "orchestrator", "hermes-runtime.json"));
const profileHome = path.resolve(flag("profile-home") ?? path.join(workspace, ".autoclaw", "hermes", "runtime-profile"));

try {
  const result = command === "prepare"
    ? await prepareHermesRuntime(manifestPath, profileHome, flag("executable") ?? (() => { throw new Error("--executable is required for prepare"); })())
    : command === "activate"
      ? await activateHermesRuntime(manifestPath, profileHome)
      : command === "rollback"
        ? await rollbackHermesRuntime(manifestPath, profileHome)
        : await readHermesRuntimeManifest(manifestPath, profileHome);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
