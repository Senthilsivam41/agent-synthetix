import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { orchestratorFsApi } from "./plugins/orchestratorFsApi";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  plugins: [react(), ...(process.env.VITEST ? [] : [orchestratorFsApi({ workspaceRoot: rootDir })])],
  server: {
    port: 5173,
    fs: { allow: [rootDir] },
  },
});
