import { readFileSync } from "node:fs";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { SCHEMA_VERSION, type ExecutionEvent, type ReviewVerdict } from "./contracts";

type ContractName =
  | "AgentProfile"
  | "AgentSession"
  | "TaskAssignment"
  | "ExecutionEvent"
  | "ArtifactManifest"
  | "VerificationEvidence"
  | "ReviewRequest"
  | "ReviewVerdict"
  | "ExecutionSummary"
  | "GuardFinding"
  | "PlanManifest"
  | "AdapterConfig"
  | "AdapterRegistration"
  | "CapabilitySnapshot"
  | "HermesCompletionContract"
  | "ExternalRunRecord";

type SchemaBundle = {
  $id: string;
  definitions: Record<string, Record<string, unknown>>;
};

const bundlePath = new URL("../../schemas/control-plane.schema.json", import.meta.url);
const schemaBundle = JSON.parse(readFileSync(bundlePath, "utf8")) as SchemaBundle;
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(schemaBundle);

export const CONTRACT_SCHEMAS = schemaBundle.definitions;

const validators = new Map<ContractName, ValidateFunction>();

function validator(name: ContractName) {
  const cached = validators.get(name);
  if (cached) return cached;
  if (!schemaBundle.definitions[name]) throw new Error(`generated schema is missing ${name}`);
  const compiled = ajv.compile({ $ref: `${schemaBundle.$id}#/definitions/${name}` });
  validators.set(name, compiled);
  return compiled;
}

function formatErrors(errors: ErrorObject[] | null | undefined) {
  return (errors ?? []).map((error) => {
    const location = error.instancePath || "value";
    const detail = error.keyword === "additionalProperties"
      ? `unexpected property ${String(error.params.additionalProperty)}`
      : error.keyword === "required"
        ? `missing required property ${String(error.params.missingProperty)}`
      : error.message ?? error.keyword;
    return `${location} ${detail}`;
  }).join("; ");
}

export function validateContract<T>(name: ContractName, value: unknown, label: string): T {
  const validate = validator(name);
  if (!validate(value)) throw new Error(`${label} failed schema validation: ${formatErrors(validate.errors)}`);
  return value as T;
}

export function parseReviewVerdict(value: unknown): ReviewVerdict {
  assertSupportedVersion(value, "review verdict");
  return validateContract<ReviewVerdict>("ReviewVerdict", value, "review verdict");
}

export function parseExecutionEvent(value: unknown): ExecutionEvent {
  assertSupportedVersion(value, "execution event");
  const event = validateContract<ExecutionEvent>("ExecutionEvent", value, "execution event");
  if (!Number.isFinite(Date.parse(event.occurred_at))) throw new Error("execution event occurred_at must be an ISO timestamp");
  return event;
}

function assertSupportedVersion(value: unknown, label: string) {
  if (value && typeof value === "object" && !Array.isArray(value) && "schema_version" in value && (value as { schema_version?: unknown }).schema_version !== SCHEMA_VERSION) {
    throw new Error(`${label} has unsupported schema_version`);
  }
}
