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

    const onSaved = vi.fn();
    render(
      <RosterManagerPage
        courseFolder={{
          id: "course",
          path: "/course",
          displayAlias: "Course",
          lastOpenedAt: "",
          lastRefreshedAt: null,
          lastDashboardStatus: null
        }}
        onSaved={onSaved}
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
    expect(screen.queryByRole("dialog", { name: "Save roster changes?" })).not.toBeInTheDocument();
    expect(screen.getByText("Saved terms/27s1/rosters/001.csv")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(screen.getByText("Changes saved.")).toHaveAttribute("role", "status");
  });

  it("edits faculty assignments in the selected section before saving", async () => {
    const previewRosterSave = vi.fn().mockResolvedValue({
      status: "ready",
      path: "terms/27s1/rosters/001.csv",
      content: "student_id,github_username,section,status\n",
      exists: true,
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
        rows: [],
        faculty: [],
        diagnostics: []
      }),
      previewRosterSave,
      saveRoster: vi.fn().mockResolvedValue({
        status: "success",
        path: "terms/27s1/rosters/001.csv",
        diagnostics: []
      })
    });

    render(
      <RosterManagerPage
        courseFolder={{
          id: "course",
          path: "/course",
          displayAlias: "Course",
          lastOpenedAt: "",
          lastRefreshedAt: null,
          lastDashboardStatus: null
        }}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(await screen.findByLabelText("Term"), { target: { value: "27s1" } });
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "001" } });
    await screen.findByText("No faculty assigned.");
    fireEvent.change(screen.getByLabelText("Faculty username"), { target: { value: " jones " } });
    fireEvent.click(screen.getByRole("button", { name: "Add faculty" }));
    expect(screen.getByText("jones")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove jones" }));
    expect(screen.getByText("No faculty assigned.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Faculty username"), { target: { value: "jones" } });
    fireEvent.click(screen.getByRole("button", { name: "Add faculty" }));
    fireEvent.click(screen.getByRole("button", { name: "Save roster" }));

    await waitFor(() =>
      expect(previewRosterSave).toHaveBeenCalledWith(
        expect.objectContaining({ faculty: ["jones"] })
      )
    );
  });
});
