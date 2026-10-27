import { describe, expect, it } from "vitest";
import type { StudentPagesAccessResult } from "../../electron/ipc";
import { getStudentPagesAccessWarning } from "./studentPagesAccessWarning";

const result = (overrides: Partial<StudentPagesAccessResult>): StudentPagesAccessResult => ({
  status: "success",
  granted: [],
  removed: [],
  failedGithubUsernames: [],
  diagnostics: [],
  ...overrides
});
const RETRY = "Save the roster again to retry.";

describe("getStudentPagesAccessWarning", () => {
  it("is silent when access is up to date, unconfigured, or unchecked", () => {
    expect(getStudentPagesAccessWarning(undefined, RETRY)).toBeNull();
    expect(getStudentPagesAccessWarning(result({ granted: ["ada"] }), RETRY)).toBeNull();
    expect(getStudentPagesAccessWarning(result({ status: "not_configured" }), RETRY)).toBeNull();
  });

  it("names students whose access failed and says how to retry", () => {
    expect(
      getStudentPagesAccessWarning(
        result({ status: "partial_failure", failedGithubUsernames: ["ada", "bob"] }),
        RETRY
      )
    ).toBe(
      "Student access to the Pages site could not be updated for ada, bob. Save the roster again to retry."
    );
  });

  it("explains a check that could not run", () => {
    expect(
      getStudentPagesAccessWarning(
        result({ status: "failure", diagnostics: [{ message: "GitHub sign-in is unavailable." }] }),
        "Run Apply again to retry."
      )
    ).toBe("GitHub sign-in is unavailable. Run Apply again to retry.");
  });

  it("shows a note from a successful check without a retry hint", () => {
    expect(
      getStudentPagesAccessWarning(
        result({ diagnostics: [{ message: "No Pages access was removed." }] }),
        RETRY
      )
    ).toBe("No Pages access was removed.");
  });
});
