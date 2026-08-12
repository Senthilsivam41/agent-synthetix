import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { activateHermesRuntime, inspectHermesRuntime, prepareHermesRuntime, readHermesRuntimeManifest, rollbackHermesRuntime } from "../plugins/control-plane/hermes-compatibility";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true }); });

describe("Hermes compatibility baseline", () => {
  it("classifies the pinned target and records transport capabilities without credentials", () => {
    const result = inspectHermesRuntime("hermes", (_executable, args) => args[0] === "--version" ? "Hermes Agent v0.20.0\n" : "Commands: acp gateway api-server a2a\n", "2026-08-12T00:00:00.000Z");
    expect(result.status).toBe("supported");
    expect(result.detected_version).toBe("0.20.0");
    expect(result.capabilities).toEqual(expect.arrayContaining(["version-report", "acp", "tui-gateway", "api-server", "a2a"]));
    expect(result.capability_output_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("API_KEY");
  });

  it("distinguishes missing, older, and unrecognized runtimes", () => {
    expect(inspectHermesRuntime("missing", () => { const error = new Error("not found") as Error & { code?: string }; error.code = "ENOENT"; throw error; }).status).toBe("missing");
    expect(inspectHermesRuntime("old", () => "Hermes Agent v0.17.0\n").status).toBe("incompatible");
    expect(inspectHermesRuntime("future", () => "Hermes Agent nightly\n").status).toBe("untested");
  });

  it("prepares, activates, and rolls back an isolated runtime manifest", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "synthetix-hermes-runtime-")); roots.push(root);
    const manifestPath = path.join(root, "hermes-runtime.json");
    const profileHome = path.join(root, "profile");
    await prepareHermesRuntime(manifestPath, profileHome, "/opt/hermes-v020/bin/hermes");
    expect((await readHermesRuntimeManifest(manifestPath, profileHome)).candidate_executable).toBe("/opt/hermes-v020/bin/hermes");
    await prepareHermesRuntime(manifestPath, profileHome, "/opt/hermes-v017/bin/hermes");
    await activateHermesRuntime(manifestPath, profileHome);
    await prepareHermesRuntime(manifestPath, profileHome, "/opt/hermes-v020/bin/hermes");
    await activateHermesRuntime(manifestPath, profileHome);
    const rolledBack = await rollbackHermesRuntime(manifestPath, profileHome);
    expect(rolledBack.active_executable).toBe("/opt/hermes-v017/bin/hermes");
    expect(rolledBack.candidate_executable).toBeNull();
  });
});
