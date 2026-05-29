import { describe, expect, it } from "vitest";
import { DiagnosticCode } from "../../../src/diagnostics/error-catalog.js";
import { mapGradingStatus } from "../../../src/grading/grading-status-mapper.js";

const completedSuccessInput = {
  gradingEnabled: true,
  workflowConfigured: true,
  workflowFound: true,
  workflowRunStatus: "completed" as const,
  workflowRunConclusion: "success" as const
};

describe("grading status mapping", () => {
  it("TC-GRADING-004 missing result file maps missing_result_file", () => {
    const result = mapGradingStatus({
      ...completedSuccessInput,
      artifactStatus: "found",
      resultFileStatus: "missing"
    });

    expect(result).toMatchObject({
      workflowStatus: "completed",
      artifactStatus: "found",
      resultFileStatus: "missing",
      resultStatus: "missing_result_file"
    });
  });

  it("TC-GRADING-005 invalid result file maps invalid_result_file", () => {
    const result = mapGradingStatus({
      ...completedSuccessInput,
      artifactStatus: "found",
      resultFileStatus: "invalid"
    });

    expect(result.resultStatus).toBe("invalid_result_file");
  });

  it("TC-GRADING-006 grading disabled maps not_configured", () => {
    const result = mapGradingStatus({
      gradingEnabled: false,
      workflowConfigured: false,
      workflowFound: false,
      artifactStatus: "found",
      resultFileStatus: "valid",
      parsedResultStatus: "passed"
    });

    expect(result).toMatchObject({
      workflowStatus: "not_configured",
      resultStatus: "not_configured",
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });
  });

  it("TC-GRADING-007 workflow missing maps missing_workflow", () => {
    const result = mapGradingStatus({
      gradingEnabled: true,
      workflowConfigured: true,
      workflowFound: false,
      artifactStatus: "found",
      resultFileStatus: "valid",
      parsedResultStatus: "passed"
    });

    expect(result).toMatchObject({
      workflowStatus: "missing_workflow",
      resultStatus: "missing_workflow",
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });
  });

  it("TC-GRADING-008 workflow failed no results maps workflow_failed_no_results", () => {
    const result = mapGradingStatus({
      gradingEnabled: true,
      workflowConfigured: true,
      workflowFound: true,
      workflowRunStatus: "completed",
      workflowRunConclusion: "failure",
      artifactStatus: "missing",
      resultFileStatus: "not_checked"
    });

    expect(result).toMatchObject({
      workflowStatus: "workflow_failed_no_results",
      resultStatus: "workflow_failed_no_results"
    });
  });

  it("workflow not run maps not_run", () => {
    const result = mapGradingStatus({
      gradingEnabled: true,
      workflowConfigured: true,
      workflowFound: true,
      workflowRunStatus: "not_run",
      workflowRunConclusion: null,
      artifactStatus: "found",
      resultFileStatus: "valid",
      parsedResultStatus: "passed"
    });

    expect(result).toMatchObject({
      workflowStatus: "not_run",
      resultStatus: "not_run",
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });
  });

  it("artifact missing maps missing_artifact", () => {
    const result = mapGradingStatus({
      ...completedSuccessInput,
      artifactStatus: "missing",
      resultFileStatus: "not_checked"
    });

    expect(result).toMatchObject({
      workflowStatus: "completed",
      artifactStatus: "missing",
      resultFileStatus: "not_checked",
      resultStatus: "missing_artifact"
    });
  });

  it("valid result file maps to parsed result status", () => {
    const result = mapGradingStatus({
      ...completedSuccessInput,
      artifactStatus: "found",
      resultFileStatus: "valid",
      parsedResultStatus: "failed"
    });

    expect(result.resultStatus).toBe("failed");
  });

  it("valid result file with missing parsed result maps unknown", () => {
    const result = mapGradingStatus({
      ...completedSuccessInput,
      artifactStatus: "found",
      resultFileStatus: "valid"
    });

    expect(result.resultStatus).toBe("unknown");
  });

  it("failed workflow with valid result file preserves parsed status with warning", () => {
    const result = mapGradingStatus({
      gradingEnabled: true,
      workflowConfigured: true,
      workflowFound: true,
      workflowRunStatus: "completed",
      workflowRunConclusion: "failure",
      artifactStatus: "found",
      resultFileStatus: "valid",
      parsedResultStatus: "error"
    });

    expect(result.resultStatus).toBe("error");
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowFailedWithResults })
    ]);
  });
});
