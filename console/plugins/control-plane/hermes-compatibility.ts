import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

export const HERMES_TARGET_VERSION = "0.20.0" as const;
export const HERMES_TARGET_RELEASE = "v2026.8.3" as const;

export type HermesCompatibilityStatus = "missing" | "incompatible" | "supported" | "untested";

export type HermesRuntimeCompatibility = {
  checked_at: string;
  executable: string;
  target_version: typeof HERMES_TARGET_VERSION;
  target_release: typeof HERMES_TARGET_RELEASE;
  detected_version: string | null;
  status: HermesCompatibilityStatus;
  capabilities: string[];
  capability_output_fingerprint: string;
  diagnostic: string | null;
};

export type HermesRuntimeManifest = {
  manifest_version: "1";
  target_version: typeof HERMES_TARGET_VERSION;
  target_release: typeof HERMES_TARGET_RELEASE;
  active_executable: string | null;
  candidate_executable: string | null;
  previous_executable: string | null;
  profile_home: string;
  prepared_at: string | null;
  activated_at: string | null;
  rolled_back_at: string | null;
};

type CommandRunner = (executable: string, args: string[]) => string;

function runCommand(executable: string, args: string[]) {
  return execFileSync(executable, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH },
    timeout: 10_000,
    windowsHide: true,
  });
}

function parseVersion(value: string) {
  const match = value.match(/\b(?:v)?(\d+)\.(\d+)\.(\d+)\b/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

function detectCapabilities(help: string) {
  const lower = help.toLowerCase();
  const candidates: Array<[string, string[]]> = [
    ["acp", [" acp", "\nacp"]],
    ["tui-gateway", ["tui gateway", "tui_gateway", "gateway json-rpc", " gateway"]],
    ["api-server", ["api server", "api-server", "/v1/runs", "api_server"]],
    ["a2a", ["a2a", "agent-to-agent"]],
  ];
  return ["version-report", ...candidates.filter(([, needles]) => needles.some((needle) => lower.includes(needle))).map(([name]) => name)];
}

export function inspectHermesRuntime(
  executable: string,
  runner: CommandRunner = runCommand,
  checkedAt = new Date().toISOString(),
): HermesRuntimeCompatibility {
  let versionOutput = "";
  let helpOutput = "";
  let diagnostic: string | null = null;
  try {
    versionOutput = runner(executable, ["--version"]);
    try { helpOutput = runner(executable, ["--help"]); } catch { /* version is enough to report compatibility */ }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = error instanceof Error ? error.message : String(error);
    const missing = code === "ENOENT" || /not found|cannot find/i.test(message);
    return {
      checked_at: checkedAt, executable, target_version: HERMES_TARGET_VERSION, target_release: HERMES_TARGET_RELEASE,
      detected_version: null, status: missing ? "missing" : "untested", capabilities: [],
      capability_output_fingerprint: fingerprint(`${versionOutput}\n${helpOutput}`), diagnostic: missing ? "Hermes executable was not found" : message,
    };
  }

  const detectedVersion = parseVersion(versionOutput);
  const status: HermesCompatibilityStatus = !detectedVersion
    ? "untested"
    : compareVersions(detectedVersion, HERMES_TARGET_VERSION) < 0
      ? "incompatible"
      : detectedVersion === HERMES_TARGET_VERSION ? "supported" : "untested";
  if (!detectedVersion) diagnostic = "Hermes version output did not contain a semantic version";
  if (status === "incompatible") diagnostic = `Hermes ${detectedVersion} is older than the pinned target ${HERMES_TARGET_VERSION}`;
  if (status === "untested" && detectedVersion) diagnostic = `Hermes ${detectedVersion} is not the pinned target ${HERMES_TARGET_VERSION}`;
  return {
    checked_at: checkedAt, executable, target_version: HERMES_TARGET_VERSION, target_release: HERMES_TARGET_RELEASE,
    detected_version: detectedVersion, status, capabilities: detectCapabilities(helpOutput),
    capability_output_fingerprint: fingerprint(`${versionOutput.trim()}\n${helpOutput.trim()}`), diagnostic,
  };
}

export function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function defaultHermesRuntimeManifest(profileHome: string): HermesRuntimeManifest {
  return {
    manifest_version: "1", target_version: HERMES_TARGET_VERSION, target_release: HERMES_TARGET_RELEASE,
    active_executable: null, candidate_executable: null, previous_executable: null,
    profile_home: path.resolve(profileHome), prepared_at: null, activated_at: null, rolled_back_at: null,
  };
}

export async function readHermesRuntimeManifest(manifestPath: string, profileHome: string) {
  try {
    return JSON.parse(await fsp.readFile(manifestPath, "utf8")) as HermesRuntimeManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return defaultHermesRuntimeManifest(profileHome);
  }
}

export async function writeHermesRuntimeManifest(manifestPath: string, manifest: HermesRuntimeManifest) {
  await fsp.mkdir(path.dirname(manifestPath), { recursive: true });
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  await fsp.writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await fsp.rename(temporaryPath, manifestPath);
  return manifest;
}

export async function prepareHermesRuntime(manifestPath: string, profileHome: string, candidateExecutable: string) {
  const manifest = await readHermesRuntimeManifest(manifestPath, profileHome);
  await fsp.mkdir(manifest.profile_home, { recursive: true });
  return writeHermesRuntimeManifest(manifestPath, {
    ...manifest, candidate_executable: path.resolve(candidateExecutable), prepared_at: new Date().toISOString(),
  });
}

export async function activateHermesRuntime(manifestPath: string, profileHome: string) {
  const manifest = await readHermesRuntimeManifest(manifestPath, profileHome);
  if (!manifest.candidate_executable) throw new Error("no Hermes candidate is prepared");
  return writeHermesRuntimeManifest(manifestPath, {
    ...manifest, active_executable: manifest.candidate_executable, previous_executable: manifest.active_executable,
    candidate_executable: null, activated_at: new Date().toISOString(), rolled_back_at: null,
  });
}

export async function rollbackHermesRuntime(manifestPath: string, profileHome: string) {
  const manifest = await readHermesRuntimeManifest(manifestPath, profileHome);
  if (!manifest.previous_executable) throw new Error("no previous Hermes runtime is available for rollback");
  return writeHermesRuntimeManifest(manifestPath, {
    ...manifest, active_executable: manifest.previous_executable, candidate_executable: null,
    previous_executable: null, rolled_back_at: new Date().toISOString(),
  });
}
