import fs from "node:fs";
import path from "node:path";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";

export interface ReportFileWrite {
  absolutePath: string;
  relativePath: string;
  content: string;
}

export interface ReportWriteResult {
  generatedFiles: string[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

export const writeReportFiles = (files: readonly ReportFileWrite[]): ReportWriteResult => {
  const generatedFiles: string[] = [];
  const errors: Diagnostic[] = [];

  for (const file of files) {
    try {
      fs.mkdirSync(path.dirname(file.absolutePath), { recursive: true });
      fs.writeFileSync(file.absolutePath, file.content, "utf8");
      generatedFiles.push(file.relativePath);
    } catch (error: unknown) {
      errors.push(
        createConfigDiagnostic(DiagnosticCode.ReportWriteFailed, "Failed to write report file.", {
          path: file.relativePath,
          reason: error instanceof Error ? error.message : "Unknown write failure."
        })
      );
    }
  }

  return {
    generatedFiles,
    warnings: [],
    errors
  };
};
