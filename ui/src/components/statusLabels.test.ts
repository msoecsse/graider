import { describe, expect, it } from "vitest";
import { formatReasonLabel, formatStatusLabel, hasAttentionStatus } from "./statusLabels";

describe("formatStatusLabel", () => {
  it("returns 'Unavailable' for null", () => {
    expect(formatStatusLabel(null)).toBe("Unavailable");
  });

  it("returns 'Unavailable' for an empty or blank string", () => {
    expect(formatStatusLabel("")).toBe("Unavailable");
    expect(formatStatusLabel("   ")).toBe("Unavailable");
  });

  it.each([
    ["available", "Available"],
    ["branch_missing", "Branch missing"],
    ["disabled", "Disabled"],
    ["error", "Error"],
    ["inaccessible", "Inaccessible"],
    ["missing", "Missing"],
    ["not_checked", "Not checked"],
    ["not_configured", "Not configured"],
    ["not_required", "Not required"],
    ["partial_success", "Partially checked"],
    ["success", "Ready"],
    ["token_required", "Token required"],
    ["auth_required", "Sign-in required"],
    ["failure", "Failed"],
    ["draft", "Draft"],
    ["active", "Active"],
    ["closed", "Closed"],
    ["archived", "Archived"],
    ["cloned", "Cloned"],
    ["failed", "Failed"]
  ])("maps %s to %s", (status, label) => {
    expect(formatStatusLabel(status)).toBe(label);
  });

  it("falls back to a readable, underscore-free string for an unmapped value", () => {
    expect(formatStatusLabel("some_new_status")).toBe("some new status");
  });

  it("never returns the raw value unchanged when it contains an underscore", () => {
    expect(formatStatusLabel("dashboard_command_failed")).not.toContain("_");
  });
});

describe("hasAttentionStatus", () => {
  it("returns false for null and for the non-attention statuses", () => {
    expect(hasAttentionStatus(null)).toBe(false);
    expect(hasAttentionStatus("available")).toBe(false);
    expect(hasAttentionStatus("not_required")).toBe(false);
    expect(hasAttentionStatus("not_checked")).toBe(false);
    expect(hasAttentionStatus("not_configured")).toBe(false);
    expect(hasAttentionStatus("disabled")).toBe(false);
  });

  it("returns true for anything else, including an unmapped value", () => {
    expect(hasAttentionStatus("missing")).toBe(true);
    expect(hasAttentionStatus("token_required")).toBe(true);
    expect(hasAttentionStatus("some_new_status")).toBe(true);
  });
});

describe("formatReasonLabel", () => {
  it("returns 'Unavailable' for null or blank", () => {
    expect(formatReasonLabel(null)).toBe("Unavailable");
    expect(formatReasonLabel("")).toBe("Unavailable");
  });

  it.each([
    ["student_repository_missing", "No repository yet"],
    ["student_repository_exists", "Repository ready"],
    ["student_repository_status_unknown", "Repository status unknown"],
    ["manifest_repository_missing", "Tracked repository is missing"],
    ["manifest_tracked_repository", "Repository already tracked"],
    ["invalid_repository_name", "Repository name is invalid"],
    ["token_required", "Token required"],
    ["grading_not_configured", "Grading not configured"],
    ["grading_workflow_missing", "Grading workflow missing"],
    ["workflow_dispatch_missing", "Workflow can't be triggered automatically"],
    ["workflow_dispatch_available", "Ready to dispatch"],
    ["draft", "Draft"],
    ["active", "Active"],
    ["closed", "Closed"],
    ["archived", "Archived"],
    ["student_status_active", "Student active"],
    ["student_status_dropped", "Student dropped"],
    ["student_status_hold", "Student on hold"]
  ])("maps %s to %s", (reason, label) => {
    expect(formatReasonLabel(reason)).toBe(label);
  });

  it("falls back to a readable, underscore-free string for an unmapped reason", () => {
    expect(formatReasonLabel("manifest_entry_missing")).toBe("manifest entry missing");
  });

  it("never returns the raw value unchanged when it contains an underscore", () => {
    expect(formatReasonLabel("some_new_reason")).not.toContain("_");
  });
});
