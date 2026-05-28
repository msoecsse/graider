import { describe, expect, it } from "vitest";
import { resolveExitCode } from "../../../src/core/exit-codes.js";
import { DiagnosticCode, createConfigDiagnostic } from "../../../src/diagnostics/error-catalog.js";

describe("exit code resolution", () => {
  it("TC-EXIT-001 warnings only exit 0", () => {
    expect(
      resolveExitCode({
        status: "success",
        warnings: [
          {
            code: "student_id_normalized",
            severity: "warning",
            message: "Normalized."
          }
        ],
        errors: []
      })
    ).toBe(0);
  });

  it("TC-EXIT-002 validation error exits 1", () => {
    expect(
      resolveExitCode({
        status: "failure",
        warnings: [],
        errors: [createConfigDiagnostic(DiagnosticCode.DuplicateStudentId, "Duplicate.")]
      })
    ).toBe(1);
  });

  it("TC-EXIT-003 partial success exits 2", () => {
    expect(
      resolveExitCode({
        status: "partial_success",
        warnings: [],
        errors: []
      })
    ).toBe(2);
  });

  it("TC-EXIT-004 auth failure exits 3", () => {
    expect(
      resolveExitCode({
        status: "failure",
        warnings: [],
        errors: [createConfigDiagnostic(DiagnosticCode.GithubAuthFailed, "Auth failed.")]
      })
    ).toBe(3);
  });

  it("TC-EXIT-005 API failure exits 4", () => {
    expect(
      resolveExitCode({
        status: "failure",
        warnings: [],
        errors: [createConfigDiagnostic(DiagnosticCode.GithubRateLimited, "Rate limited.")]
      })
    ).toBe(4);
  });

  it("TC-EXIT-006 schema failure exits 5", () => {
    expect(
      resolveExitCode({
        status: "failure",
        warnings: [],
        errors: [createConfigDiagnostic(DiagnosticCode.InvalidYaml, "Invalid YAML.")]
      })
    ).toBe(5);
  });

  it("TC-EXIT-007 exit precedence is deterministic", () => {
    expect(
      resolveExitCode({
        status: "partial_success",
        warnings: [],
        errors: [
          createConfigDiagnostic(DiagnosticCode.GithubApiError, "API error."),
          createConfigDiagnostic(DiagnosticCode.InvalidYaml, "Invalid YAML."),
          createConfigDiagnostic(DiagnosticCode.GithubPermissionDenied, "Denied."),
          createConfigDiagnostic(DiagnosticCode.DuplicateStudentId, "Duplicate.")
        ]
      })
    ).toBe(3);
  });
});
