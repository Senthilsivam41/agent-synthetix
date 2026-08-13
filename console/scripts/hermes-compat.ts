#!/usr/bin/env node
import { inspectHermesRuntime } from "../plugins/control-plane/hermes-compatibility";

function flag(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const executable = flag("executable") ?? process.env.HERMES_EXECUTABLE ?? "hermes";
const result = inspectHermesRuntime(executable);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.status === "supported" ? 0 : 1;
