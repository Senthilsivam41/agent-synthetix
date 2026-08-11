import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";

const consoleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(consoleRoot, "schemas", "control-plane.schema.json");
const config = {
  path: path.join(consoleRoot, "plugins", "control-plane", "contracts.ts"),
  tsconfig: path.join(consoleRoot, "tsconfig.json"),
  type: "*",
  expose: "export",
  additionalProperties: false,
  sortProps: true,
  id: "https://agent-synthetix.local/schemas/control-plane/1.0",
};

const schema = createGenerator(config).createSchema(config.type);
schema.$schema = "https://json-schema.org/draft/2020-12/schema";
schema.$id = config.id;
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
