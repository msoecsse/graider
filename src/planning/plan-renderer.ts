import fs from "node:fs";
import path from "node:path";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { stringifyStableJson } from "../io/stable-json.js";
import type { Plan } from "./plan-models.js";

export interface PlanWriteResult {
  status: "success" | "failure";
  diagnostic?: Diagnostic;
}

export const renderPlanJson = (plan: Plan): string => stringifyStableJson(plan);

export const writePlanJsonFile = (plan: Plan, absolutePath: string): PlanWriteResult => {
  try {
    fs.mkdirSync(path.dirname(absolutePath), {
      recursive: true
    });
    fs.writeFileSync(absolutePath, `${renderPlanJson(plan)}\n`, "utf8");

    return {
      status: "success"
    };
  } catch (error: unknown) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        DiagnosticCode.PlanWriteFailed,
        "Failed to write plan file.",
        {
          path: absolutePath,
          reason: error instanceof Error ? error.message : "unknown"
        }
      )
    };
  }
};
