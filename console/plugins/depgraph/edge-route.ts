import type { DependencyNotifyResult, EdgeLogError } from "../control-plane/contracts";
import { edgeLogError, executeEdgeLog, type EdgeLogResponse, type EdgeRouteName } from "./edge-log";
import { notifyDependents } from "./notify";
import { admitDependencyEdge } from "./validator";

export type EdgeRouteResponse = EdgeLogResponse | DependencyNotifyResult | EdgeLogError;

export function executeEdgeRoute(options: {
  command: EdgeRouteName;
  workspace: string;
  request: unknown;
}): EdgeRouteResponse {
  switch (options.command) {
    case "add":
      return admitDependencyEdge({ workspace: options.workspace, request: options.request });
    case "notify":
      return notifyDependents({ workspace: options.workspace, request: options.request });
    case "claim":
    case "remove":
    case "dependents":
      return executeEdgeLog({ command: options.command, workspace: options.workspace, request: options.request });
    default: {
      const unknown: never = options.command;
      return edgeLogError("MALFORMED_REQUEST", `unknown edge command ${String(unknown)}`);
    }
  }
}
