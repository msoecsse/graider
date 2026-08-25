import { describe, expect, it } from "vitest";
import { getStudentAccessPagesDefaults } from "./CourseSetupPage";

describe("getStudentAccessPagesDefaults", () => {
  it("derives repository and Pages URL defaults from the selected course organization", () => {
    expect(getStudentAccessPagesDefaults("csc1120")).toEqual({
      repository: "csc1120/csc1120pages",
      baseUrl: "https://csc1120.github.io/csc1120pages"
    });
  });

  it("does not substitute a stale organization when none is selected", () => {
    expect(getStudentAccessPagesDefaults("")).toEqual({ repository: "", baseUrl: "" });
  });
});
