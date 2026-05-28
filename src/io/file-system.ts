import fs from "node:fs";
import { createMissingRequiredFileDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

export type ReadTextFileResult =
  | {
      status: "success";
      content: string;
    }
  | {
      status: "failure";
      diagnostic: Diagnostic;
    };

export const readTextFile = (filePath: string): ReadTextFileResult => {
  try {
    return {
      status: "success",
      content: fs.readFileSync(filePath, "utf8")
    };
  } catch {
    return {
      status: "failure",
      diagnostic: createMissingRequiredFileDiagnostic(filePath, filePath)
    };
  }
};
