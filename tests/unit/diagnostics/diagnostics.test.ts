import { describe, expect, it } from "vitest";
import {
  DiagnosticCode,
  createConfigDiagnostic,
  createWarningDiagnostic
} from "../../../src/diagnostics/error-catalog.js";
import {
  redactCommandResult,
  redactString,
  redactValue
} from "../../../src/diagnostics/redaction.js";
import { ExitCode } from "../../../src/core/exit-codes.js";
import type { CommandResult } from "../../../src/core/command-result.js";

const TOKEN_VALUE = "ghp_abcdefghijklmnopqrstuvwxyz123456";
const REDACTED_VALUE = "[REDACTED]";

describe("diagnostics", () => {
  it("TC-DIAG-001 warning shape includes code/message/severity", () => {
    const warning = createWarningDiagnostic(DiagnosticCode.StudentIdNormalized, "Normalized.", {
      token: TOKEN_VALUE
    });

    expect(warning).toMatchObject({
      code: "student_id_normalized",
      severity: "warning",
      message: "Normalized."
    });
  });

  it("TC-DIAG-002 error shape includes code/message/severity", () => {
    const error = createConfigDiagnostic(DiagnosticCode.MissingRequiredFile, "Missing course.yml.");

    expect(error).toMatchObject({
      code: "missing_required_file",
      severity: "error",
      message: "Missing course.yml."
    });
  });

  it("TC-DIAG-003 token-like values are redacted", () => {
    const result: CommandResult = {
      commandName: "validate",
      assignmentFile: "assignment.yml",
      status: "failure",
      exitCode: ExitCode.CommandError,
      warnings: [],
      errors: [
        createConfigDiagnostic(DiagnosticCode.InvalidGithubUsername, `Bad token ${TOKEN_VALUE}.`, {
          token: TOKEN_VALUE,
          nested: {
            authorization: `Bearer ${TOKEN_VALUE}`,
            visible: "safe"
          }
        })
      ],
      generatedFiles: [],
      summary: {
        apiKey: TOKEN_VALUE,
        values: [TOKEN_VALUE, "safe"]
      }
    };

    expect(redactString(`token=${TOKEN_VALUE}`)).toBe(`token=${REDACTED_VALUE}`);
    expect(
      redactValue({ github_token: TOKEN_VALUE, password: TOKEN_VALUE, visible: "safe" })
    ).toEqual({
      github_token: REDACTED_VALUE,
      password: REDACTED_VALUE,
      visible: "safe"
    });
    expect(redactCommandResult(result).errors[0]?.context).toEqual({
      token: REDACTED_VALUE,
      nested: {
        authorization: REDACTED_VALUE,
        visible: "safe"
      }
    });
    expect(redactCommandResult(result).summary).toEqual({
      apiKey: REDACTED_VALUE,
      values: [REDACTED_VALUE, "safe"]
    });
  });
});
