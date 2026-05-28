import { parseDocument } from "yaml";
import { createInvalidYamlDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

export type ParseYamlResult =
  | {
      status: "success";
      value: unknown;
    }
  | {
      status: "failure";
      diagnostic: Diagnostic;
    };

export const parseYaml = (content: string, filePath: string): ParseYamlResult => {
  const document = parseDocument(content, {
    strict: true
  });

  if (document.errors.length > 0) {
    return {
      status: "failure",
      diagnostic: createInvalidYamlDiagnostic(
        filePath,
        document.errors[0]?.message ?? "Invalid YAML."
      )
    };
  }

  return {
    status: "success",
    value: document.toJSON()
  };
};
