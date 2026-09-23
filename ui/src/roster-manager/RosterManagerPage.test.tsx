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
      source: {
        kind: "manual_edit",
        updatedAt: "2026-09-22T22:00:00.000Z",
        updatedBy: "jones"
      },
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
        source: {
          kind: "csv_upload",
          updatedAt: "2026-09-20T22:00:00.000Z",
          updatedBy: "jones"
        },
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
    fireEvent.change(screen.getByLabelText("status row 1"), { target: { value: "hold" } });
    fireEvent.click(screen.getByRole("button", { name: "Save roster" }));

    const dialog = await screen.findByRole("dialog", { name: "Save roster changes?" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Update roster with 1 student record.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save roster" }));
    await waitFor(() =>
      expect(saveRoster).toHaveBeenCalledWith(
        expect.objectContaining({ confirmed: true, sourceKind: "manual_edit" })
      )
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
    expect(previewRosterSave.mock.calls.at(-1)?.[0]).not.toHaveProperty("sourceKind");
  });

  it("classifies CSV replacement and a later row edit by the most recent roster change", async () => {
    const previewRosterSave = vi.fn().mockResolvedValue({
      status: "ready",
      path: "terms/27s1/rosters/001.csv",
      content: "student_id,github_username,section,status\ns002,hubot,001,active\n",
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
      previewRosterSave
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
    const file = {
      text: vi
        .fn()
        .mockResolvedValue("student_id,github_username,section,status\ns002,hubot,001,active\n")
    };
    fireEvent.change(screen.getByLabelText("Replace from CSV"), { target: { files: [file] } });
    await screen.findByDisplayValue("hubot");
    fireEvent.click(screen.getByRole("button", { name: "Save roster" }));
    await waitFor(() =>
      expect(previewRosterSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ sourceKind: "csv_upload" })
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.change(screen.getByLabelText("student_id row 1"), { target: { value: "s003" } });
    fireEvent.click(screen.getByRole("button", { name: "Save roster" }));
    await waitFor(() =>
      expect(previewRosterSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ sourceKind: "manual_edit" })
      )
    );
  });

  it("retains pending manual provenance after a failed save for retry", async () => {
    const previewRosterSave = vi.fn().mockResolvedValue({
      status: "ready",
      path: "terms/27s1/rosters/001.csv",
      content: "student_id,github_username,section,status\ns001,ada,001,hold\n",
      exists: true,
      diagnostics: []
    });
    const saveRoster = vi
      .fn()
      .mockResolvedValueOnce({
        status: "failure",
        path: "terms/27s1/rosters/001.csv",
        diagnostics: [{ message: "Write failed." }]
      })
      .mockResolvedValueOnce({
        status: "success",
        path: "terms/27s1/rosters/001.csv",
        source: {
          kind: "manual_edit",
          updatedAt: "2026-09-22T22:00:00.000Z",
          updatedBy: "jones"
        },
        diagnostics: [{ message: "Saved locally; publication failed." }],
        publication: { status: "failure", diagnostics: [] }
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
        faculty: [],
        diagnostics: []
      }),
      previewRosterSave,
      saveRoster
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
    await screen.findByDisplayValue("ada");
    fireEvent.change(screen.getByLabelText("status row 1"), { target: { value: "hold" } });
    fireEvent.click(screen.getByRole("button", { name: "Save roster" }));
    const dialog = await screen.findByRole("dialog", { name: "Save roster changes?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save roster" }));
    await screen.findByText("Write failed.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save roster" }));
    await waitFor(() => expect(saveRoster).toHaveBeenCalledTimes(2));
    expect(saveRoster.mock.calls.map(([saveRequest]) => saveRequest.sourceKind)).toEqual([
      "manual_edit",
      "manual_edit"
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Save roster changes?" })).not.toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText("Faculty username"), { target: { value: "smith" } });
    fireEvent.click(screen.getByRole("button", { name: "Add faculty" }));
    fireEvent.click(screen.getByRole("button", { name: "Save roster" }));
    await waitFor(() => expect(previewRosterSave).toHaveBeenCalledTimes(2));
    expect(previewRosterSave.mock.calls.at(-1)?.[0]).not.toHaveProperty("sourceKind");
  });
});
