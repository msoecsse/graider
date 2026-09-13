import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { CourseSetupPage, getStudentAccessPagesDefaults } from "./CourseSetupPage";

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

  it("keeps faculty usernames associated with their configured sections", async () => {
    const previewCourseSetup = vi.fn().mockResolvedValue({
      status: "ready",
      files: [],
      diagnostics: [],
      hasConflicts: false
    });
    Object.assign(window.graiderUI, { previewCourseSetup });
    render(
      createElement(CourseSetupPage, {
        courseFolderPath: "/course",
        onBack: vi.fn(),
        onSaved: vi.fn()
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Sections and rosters" }));
    fireEvent.change(screen.getByLabelText("Section ID"), { target: { value: "001" } });
    fireEvent.change(screen.getByLabelText("Faculty username"), { target: { value: " jones " } });
    fireEvent.click(screen.getByRole("button", { name: "Add faculty" }));
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    fireEvent.change(screen.getAllByLabelText("Section ID")[1]!, { target: { value: "002" } });
    fireEvent.change(screen.getAllByLabelText("Faculty username")[1]!, {
      target: { value: "smith" }
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add faculty" })[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Preview setup" }));

    await waitFor(() =>
      expect(previewCourseSetup).toHaveBeenCalledWith(
        expect.objectContaining({
          sections: [
            { id: "001", faculty: ["jones"] },
            { id: "002", faculty: ["smith"] }
          ]
        })
      )
    );
  });
});
