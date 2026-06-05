import fs from "node:fs";
import path from "node:path";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import {
  GENERATED_WORKFLOW_EXISTS_CODE,
  WORKFLOW_GENERATION_WRITE_FAILED_CODE,
  createConfigDiagnostic
} from "../diagnostics/error-catalog.js";

export type WorkflowWriteResult =
  | {
      status: "success";
    }
  | {
      status: "failure";
      diagnostic: Diagnostic;
    };

export interface WorkflowWriteRequest {
  readonly filePath: string;
  readonly content: string;
  readonly force: boolean;
}

export const writeWorkflowFile = ({
  filePath,
  content,
  force
}: WorkflowWriteRequest): WorkflowWriteResult => {
  if (!force && fs.existsSync(filePath)) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        GENERATED_WORKFLOW_EXISTS_CODE,
        `Generated workflow already exists at ${filePath}.`,
        {
          filePath
        }
      )
    };
  }

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);

    return {
      status: "success"
    };
  } catch (error) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        WORKFLOW_GENERATION_WRITE_FAILED_CODE,
        `Generated workflow could not be written to ${filePath}.`,
        {
          filePath,
          reason: error instanceof Error ? error.message : String(error)
        }
      )
    };
  }
};
