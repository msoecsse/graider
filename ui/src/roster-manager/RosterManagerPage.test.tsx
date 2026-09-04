import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RosterManagerPage } from "./RosterManagerPage";

describe("RosterManagerPage", () => {
  it("validates a roster then confirms its save in the shared preview modal", async () => {
    const previewRosterSave = vi.fn().mockResolvedValue({
      status: "ready",
      path: "terms/27s1/rosters/001.csv",
      content: "student_id,github_username,section,status\ns001,ada,001,active\n",
      exists: true,
      diagnostics: []
    });
    const saveRoster = vi.fn().mockResolvedValue({
      status: "success",
      path: "terms/27s1/rosters/001.csv",
      diagnostics: []
    });
    Object.assign(window.graiderUI, {
      loadRosterTerms: vi.fn().mockResolvedValue({
        terms: [{ code: "27s1", sections: ["001"] }],
        diagnostics: []
      }),
      getRosterForSection: vi.fn().mockResolvedValue({
        status: "ready",
        path: "terms/27s1/rosters/001.csv",
        exists: true,
        rows: [{ studentId: "s001", githubUsername: "ada", section: "001", status: "active" }],
        diagnostics: []
      }),
      previewRosterSave,
      saveRoster
    });

    render(
      <RosterManagerPage
        courseFolder={{ id: "course", path: "/course", label: "Course" }}
        onBack={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(await screen.findByLabelText("Term"), { target: { value: "27s1" } });
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "001" } });
    await screen.findByDisplayValue("ada");
    fireEvent.click(screen.getByRole("button", { name: "Save roster" }));

    const dialog = await screen.findByRole("dialog", { name: "Save roster changes?" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Update roster with 1 student record.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save roster" }));
    await waitFor(() =>
      expect(saveRoster).toHaveBeenCalledWith(expect.objectContaining({ confirmed: true }))
    );
  });
});
