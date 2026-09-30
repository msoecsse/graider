import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CourseFolderRecord, GraiderUIApi, RosterLoadResult } from "../../electron/ipc";
import { RosterManagerPage } from "./RosterManagerPage";

const COURSE_FOLDER: CourseFolderRecord = {
  id: "course",
  path: "/courses/csc1120",
  displayAlias: "CSC1120",
  lastOpenedAt: "",
  lastRefreshedAt: null,
  lastDashboardStatus: null
};

const BASE_ROWS = [
  { studentId: "S001", githubUsername: "ada", section: "001", status: "active" },
  { studentId: "S002", githubUsername: "grace", section: "001", status: "hold" }
] as const;

const readySummary = (sectionId: string, studentCount: number) => ({
  sectionId,
  status: "ready" as const,
  exists: true as const,
  studentCount,
  activeStudentCount: studentCount,
  droppedStudentCount: 0,
  holdStudentCount: 0,
  diagnostics: []
});

const readyLoad = (overrides: Partial<RosterLoadResult> = {}): RosterLoadResult => ({
  status: "ready",
  path: "terms/27s1/rosters/section-001.csv",
  exists: true,
  rows: BASE_ROWS,
  faculty: ["jones"],
  source: {
    kind: "csv_upload",
    updatedAt: "2026-09-20T22:00:00.000Z",
    updatedBy: "jones"
  },
  diagnostics: [],
  ...overrides
});

const setupApi = (overrides: Partial<GraiderUIApi> = {}) => {
  const api = {
    loadRosterTerms: vi.fn().mockResolvedValue({
      terms: [{ code: "27s1", sections: ["001", "002", "003"] }],
      diagnostics: []
    }),
    getRosterSectionSummaries: vi.fn().mockResolvedValue({
      status: "ready",
      summaries: [
        readySummary("001", 2),
        { sectionId: "002", status: "missing", exists: false, diagnostics: [] },
        {
          sectionId: "003",
          status: "invalid",
          exists: true,
          diagnostics: [{ code: "bad_roster", message: "Roster needs repair." }]
        }
      ],
      diagnostics: []
    }),
    getRosterForSection: vi.fn().mockImplementation(({ sectionId }: { sectionId: string }) =>
      Promise.resolve(
        sectionId === "001"
          ? readyLoad()
          : {
              status: "ready",
              path: `terms/27s1/rosters/section-${sectionId}.csv`,
              exists: false,
              rows: [],
              faculty: [],
              diagnostics: []
            }
      )
    ),
    previewRosterSave: vi.fn().mockResolvedValue({
      status: "ready",
      path: "terms/27s1/rosters/section-001.csv",
      content: "student_id,github_username,section,status\n",
      exists: true,
      diagnostics: []
    }),
    saveRoster: vi.fn().mockResolvedValue({
      status: "success",
      path: "terms/27s1/rosters/section-001.csv",
      source: {
        kind: "manual_edit",
        updatedAt: "2026-09-23T15:30:00.000Z",
        updatedBy: "smith"
      },
      diagnostics: []
    }),
    removeRoster: vi.fn().mockResolvedValue({
      status: "success",
      path: "terms/27s1/rosters/section-001.csv",
      diagnostics: []
    }),
    removeSection: vi.fn().mockResolvedValue({
      status: "success",
      path: "terms/27s1/rosters/section-001.csv",
      diagnostics: []
    }),
    ...overrides
  };
  Object.assign(window.graiderUI, api);
  return api;
};

const renderPage = (onSaved = vi.fn()) => {
  render(
    <RosterManagerPage
      courseFolder={COURSE_FOLDER}
      courseTitle="CSC1120"
      onSaved={onSaved}
      termCode="27s1"
      termTitle="Spring 2027"
    />
  );
  return onSaved;
};

const waitForInitialRoster = async (): Promise<void> => {
  await screen.findByDisplayValue("ada");
};

const openStudentMenu = (studentId: string): void => {
  fireEvent.click(screen.getByRole("button", { name: `Actions for student ${studentId}` }));
};

describe("RosterManagerPage", () => {
  it("uses the canonical routed term, bulk summaries, accessible tabs, and readable provenance", async () => {
    const api = setupApi({
      getRosterForSection: vi.fn().mockResolvedValue(
        readyLoad({
          source: {
            kind: "csv_upload",
            updatedAt: "2026-09-20T22:00:00.000Z",
            updatedBy: null
          }
        })
      )
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Manage rosters" })
    ).toHaveAttribute("id", "roster-manager-title");
    expect(screen.getByRole("main", { name: "Manage rosters" })).toBeInTheDocument();
    expect(screen.getByText("CSC1120 · Spring 2027")).toBeInTheDocument();
    expect(screen.queryByLabelText("Term")).not.toBeInTheDocument();

    expect(await screen.findByRole("tab", { name: "Section 001, 2" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "Section 002, No roster" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Section 003, Needs attention" })).toBeInTheDocument();
    expect(api.getRosterSectionSummaries).toHaveBeenCalledOnce();
    expect(api.getRosterSectionSummaries).toHaveBeenCalledWith({
      courseFolderId: "course",
      courseFolderPath: "/courses/csc1120",
      termCode: "27s1"
    });
    expect(api.getRosterForSection).toHaveBeenCalledWith(
      expect.objectContaining({ termCode: "27s1", sectionId: "001" })
    );
    expect(screen.getByText("Source:").parentElement).toHaveTextContent("Source: CSV upload");
    expect(screen.getByText(/Last updated/u)).not.toHaveTextContent("unknown");
    expect(screen.queryByText("2026-09-20T22:00:00.000Z")).not.toBeInTheDocument();
    expect(screen.getByText("Canvas sync not connected")).toBeInTheDocument();
  });

  it("keeps invalid neighboring sections selectable and shows their diagnostics", async () => {
    setupApi({
      getRosterForSection: vi.fn().mockImplementation(({ sectionId }: { sectionId: string }) =>
        Promise.resolve(
          sectionId === "003"
            ? readyLoad({
                status: "invalid",
                path: "terms/27s1/rosters/section-003.csv",
                rows: [],
                diagnostics: [{ message: "Roster header is invalid." }]
              })
            : readyLoad()
        )
      )
    });
    renderPage();
    await waitForInitialRoster();

    fireEvent.click(screen.getByRole("tab", { name: "Section 003, Needs attention" }));
    expect(await screen.findByText("Roster header is invalid.")).toHaveAttribute("role", "alert");
    expect(screen.getByRole("heading", { name: "Roster needs attention" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Section 001, 2" })).toBeInTheDocument();
  });

  it("renders manual, legacy, malformed, and unreadable-time provenance safely", async () => {
    setupApi({
      getRosterForSection: vi.fn().mockResolvedValue(
        readyLoad({
          source: {
            kind: "manual_edit",
            updatedAt: "not-an-iso-time",
            updatedBy: "smith"
          },
          diagnostics: [{ message: "Roster source metadata is invalid or unsupported." }]
        })
      )
    });
    renderPage();
    await waitForInitialRoster();
    expect(screen.getByText("Source:").parentElement).toHaveTextContent("Manual edit");
    expect(screen.getByText(/Update time unavailable/u)).toHaveTextContent("by smith");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Roster source metadata is invalid or unsupported."
    );
    expect(screen.queryByText("not-an-iso-time")).not.toBeInTheDocument();
  });

  it("shows legacy source as not recorded without inventing an author or origin", async () => {
    setupApi({
      getRosterForSection: vi.fn().mockResolvedValue({
        status: "ready",
        path: "terms/27s1/rosters/section-001.csv",
        exists: true,
        rows: BASE_ROWS,
        faculty: [],
        diagnostics: []
      })
    });
    renderPage();
    await waitForInitialRoster();
    expect(screen.getByText("Source:").parentElement).toHaveTextContent("Not recorded");
    expect(screen.getByText(/predates source tracking/u)).toBeInTheDocument();
    expect(screen.queryByText(/unknown/u)).not.toBeInTheDocument();
  });

  it("humanizes status actions while submitting the canonical machine value", async () => {
    const api = setupApi();
    renderPage();
    await waitForInitialRoster();

    expect(screen.getAllByText("Active")[0]).toHaveClass("status-chip--success");
    expect(screen.getAllByText("On hold")[0]).toHaveClass("status-chip--attention");
    expect(screen.queryByRole("option", { name: "dropped" })).not.toBeInTheDocument();
    openStudentMenu("S001");
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark dropped" }));

    expect(screen.getAllByText("Dropped")[0]).toHaveClass("status-chip--error");
    expect(
      screen.getByText("1 student change — 0 added, 0 removed, 1 changed")
    ).toBeInTheDocument();
    expect(screen.getByText("Source after save: Manual edit")).toBeInTheDocument();
    expect(screen.getByText("Source:").parentElement).toHaveTextContent("Source: CSV upload");

    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    await screen.findByRole("dialog", { name: "Review roster changes" });
    expect(api.previewRosterSave).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKind: "manual_edit",
        rows: expect.arrayContaining([
          expect.objectContaining({ studentId: "S001", status: "dropped" })
        ])
      })
    );
  });

  it("uses shared diff semantics for identity edits, removed tombstones, discard, and stable row keys", async () => {
    setupApi();
    renderPage();
    await waitForInitialRoster();

    fireEvent.change(screen.getByLabelText("GitHub username for S002"), {
      target: { value: "grace-hopper" }
    });
    openStudentMenu("S001");
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove student row" }));
    expect(screen.getByDisplayValue("grace-hopper")).toBeInTheDocument();
    expect(screen.getByLabelText("Removed before save")).toHaveTextContent("RemovedS001adaActive");

    fireEvent.change(screen.getByLabelText("Student ID for S002"), {
      target: { value: "S020" }
    });
    expect(
      screen.getByText("3 student changes — 1 added, 2 removed, 0 changed")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Removed before save")).toHaveTextContent("S002");

    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    const review = await screen.findByRole("dialog", { name: "Review roster changes" });
    expect(within(review).getByText("Added")).toBeInTheDocument();
    expect(within(review).getAllByText("Removed")).toHaveLength(2);
    fireEvent.click(within(review).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(await screen.findByDisplayValue("ada")).toBeInTheDocument();
    expect(screen.getByDisplayValue("grace")).toBeInTheDocument();
    expect(screen.queryByText(/student changes/u)).not.toBeInTheDocument();
  });

  it("parses reordered, BOM-prefixed, quoted, and extra CSV columns through the shared module", async () => {
    const api = setupApi();
    renderPage();
    await waitForInitialRoster();

    const csv =
      '\uFEFFstatus,section,github_username,student_id,email\r\nactive,001,octocat,"S,009",student@example.edu\r\n';
    fireEvent.change(screen.getByLabelText("Roster CSV file"), {
      target: { files: [{ text: vi.fn().mockResolvedValue(csv) }] }
    });

    expect(await screen.findByDisplayValue("s,009")).toBeInTheDocument();
    expect(screen.getByDisplayValue("octocat")).toBeInTheDocument();
    expect(screen.getByText("Source after save: CSV upload")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("GitHub username for s,009"), {
      target: { value: "octocat-new" }
    });
    expect(screen.getByText("Source after save: Manual edit")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    await screen.findByRole("dialog", { name: "Review roster changes" });
    expect(api.previewRosterSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceKind: "manual_edit" })
    );
  });

  it("accepts canonical and legacy uploads and keeps invalid uploads out of the draft", async () => {
    setupApi();
    renderPage();
    await waitForInitialRoster();

    const canonical = "student_id,github_username,section,status\nS008,canonical,001,active\n";
    fireEvent.change(screen.getByLabelText("Roster CSV file"), {
      target: { files: [{ text: vi.fn().mockResolvedValue(canonical) }] }
    });
    expect(await screen.findByDisplayValue("canonical")).toBeInTheDocument();

    const legacy =
      "student_id,github_username,email,first_name,last_name,section,status\nS010,legacy,legacy@example.edu,Leg,Acy,001,active\n";
    fireEvent.change(screen.getByLabelText("Roster CSV file"), {
      target: { files: [{ text: vi.fn().mockResolvedValue(legacy) }] }
    });
    expect(await screen.findByDisplayValue("legacy")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Roster CSV file"), {
      target: { files: [{ text: vi.fn().mockResolvedValue("student_id,status\nS011,active\n") }] }
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("missing required column");
    expect(screen.getByDisplayValue("legacy")).toBeInTheDocument();
  });

  it("tracks faculty membership separately, previews it, and restores it on discard", async () => {
    const api = setupApi();
    renderPage();
    await waitForInitialRoster();

    fireEvent.click(screen.getByRole("button", { name: "Remove jones" }));
    expect(screen.getByText("Faculty assignment has unsaved changes")).toBeInTheDocument();
    expect(screen.queryByText(/Source after save/u)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByText("jones")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Faculty username"), { target: { value: "smith" } });
    fireEvent.click(screen.getByRole("button", { name: "Add faculty" }));
    expect(screen.getByText("Faculty assignment has unsaved changes")).toBeInTheDocument();
    expect(screen.queryByText(/Source after save/u)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    const dialog = await screen.findByRole("dialog", { name: "Review roster changes" });
    expect(within(dialog).getByText("Faculty added: smith")).toBeInTheDocument();
    expect(vi.mocked(api.previewRosterSave).mock.calls.at(-1)?.[0]).not.toHaveProperty(
      "sourceKind"
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByText("smith")).not.toBeInTheDocument();
    expect(screen.getByText("jones")).toBeInTheDocument();
  });

  it("preserves saved provenance when a reverted student edit leaves only faculty changes", async () => {
    const api = setupApi();
    renderPage();
    await waitForInitialRoster();

    const githubInput = screen.getByLabelText("GitHub username for S001");
    fireEvent.change(githubInput, { target: { value: "temporary-name" } });
    fireEvent.change(githubInput, { target: { value: "ada" } });
    fireEvent.change(screen.getByLabelText("Faculty username"), { target: { value: "smith" } });
    fireEvent.click(screen.getByRole("button", { name: "Add faculty" }));

    expect(screen.getByText("Faculty assignment has unsaved changes")).toBeInTheDocument();
    expect(screen.queryByText(/Source after save/u)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    await screen.findByRole("dialog", { name: "Review roster changes" });
    expect(vi.mocked(api.previewRosterSave).mock.calls.at(-1)?.[0]).not.toHaveProperty(
      "sourceKind"
    );
  });

  it("guards dirty section changes and ignores a stale earlier section load", async () => {
    let resolveSecond: ((result: RosterLoadResult) => void) | undefined;
    const getRosterForSection = vi
      .fn()
      .mockImplementation(({ sectionId }: { sectionId: string }) => {
        if (sectionId === "002") {
          return new Promise<RosterLoadResult>((resolve) => {
            resolveSecond = resolve;
          });
        }
        return Promise.resolve(
          readyLoad({
            path: `terms/27s1/rosters/section-${sectionId}.csv`,
            rows: [
              {
                studentId: `S${sectionId}`,
                githubUsername: `user-${sectionId}`,
                section: sectionId,
                status: "active"
              }
            ]
          })
        );
      });
    setupApi({ getRosterForSection });
    renderPage();
    await screen.findByDisplayValue("user-001");

    fireEvent.change(screen.getByLabelText("GitHub username for S001"), {
      target: { value: "edited" }
    });
    fireEvent.click(screen.getByRole("tab", { name: "Section 002, No roster" }));
    const discardDialog = screen.getByRole("dialog", { name: "Discard unsaved changes?" });
    fireEvent.click(within(discardDialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("tab", { name: "Section 001, 2" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Section 002, No roster" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Discard unsaved changes?" })).getByRole("button", {
        name: "Discard and continue"
      })
    );
    fireEvent.click(screen.getByRole("tab", { name: "Section 003, Needs attention" }));
    expect(await screen.findByDisplayValue("user-003")).toBeInTheDocument();
    resolveSecond?.(
      readyLoad({
        path: "terms/27s1/rosters/section-002.csv",
        rows: [{ studentId: "S002", githubUsername: "stale", section: "002", status: "active" }]
      })
    );
    await waitFor(() => expect(screen.queryByDisplayValue("stale")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("user-003")).toBeInTheDocument();
  });

  it("reviews structured row changes, saves explicitly, adopts canonical source, and refreshes summaries", async () => {
    const onSaved = vi.fn();
    const api = setupApi();
    renderPage(onSaved);
    await waitForInitialRoster();

    openStudentMenu("S001");
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark dropped" }));
    fireEvent.click(screen.getByRole("button", { name: "Add student" }));
    fireEvent.change(screen.getByLabelText("Student ID for row 3"), { target: { value: "S003" } });
    fireEvent.change(screen.getByLabelText("GitHub username for S003"), {
      target: { value: "linus" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));

    const dialog = await screen.findByRole("dialog", { name: "Review roster changes" });
    expect(within(dialog).getByText("1 added · 0 removed · 1 changed")).toBeInTheDocument();
    expect(within(dialog).getByText("Status: Active → Dropped")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/does not delete their repository or published reports/u)
    ).toBeInTheDocument();
    expect(api.saveRoster).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save roster" }));

    await waitFor(() => expect(api.saveRoster).toHaveBeenCalledOnce());
    expect(await screen.findByText("Roster saved.")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Review and save" })).not.toBeInTheDocument();
    expect(screen.getByText("Source:").parentElement).toHaveTextContent("Source: Manual edit");
    expect(api.getRosterSectionSummaries).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("keeps invalid previews and failed saves dirty, but clears local dirty state after publication failure", async () => {
    const previewRosterSave = vi
      .fn()
      .mockResolvedValueOnce({
        status: "invalid",
        path: "terms/27s1/rosters/section-001.csv",
        content: "",
        exists: true,
        diagnostics: [{ message: "Student ID is required." }]
      })
      .mockResolvedValue({
        status: "ready",
        path: "terms/27s1/rosters/section-001.csv",
        content: "",
        exists: true,
        diagnostics: []
      });
    const saveRoster = vi
      .fn()
      .mockResolvedValueOnce({
        status: "failure",
        path: "terms/27s1/rosters/section-001.csv",
        diagnostics: [{ message: "Write failed." }]
      })
      .mockResolvedValueOnce({
        status: "success",
        path: "terms/27s1/rosters/section-001.csv",
        source: {
          kind: "manual_edit",
          updatedAt: "2026-09-23T15:30:00.000Z",
          updatedBy: "smith"
        },
        diagnostics: [{ message: "Push failed. Use Publish Course Changes to retry." }],
        publication: { status: "failure", diagnostics: [] }
      });
    setupApi({ previewRosterSave, saveRoster });
    renderPage();
    await waitForInitialRoster();
    openStudentMenu("S001");
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark dropped" }));

    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    expect(await screen.findByText("Student ID is required.")).toHaveAttribute("role", "alert");
    expect(screen.queryByRole("dialog", { name: "Review roster changes" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    const dialog = await screen.findByRole("dialog", { name: "Review roster changes" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save roster" }));
    expect(await within(dialog).findByText("Write failed.")).toHaveAttribute("role", "alert");
    expect(screen.getByRole("button", { name: "Review and save" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save roster" }));

    await waitFor(() => expect(saveRoster).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Review and save" })).not.toBeInTheDocument();
    expect((await screen.findByText(/Saved locally/u)).parentElement).toHaveTextContent(
      "Push failed"
    );
    expect(screen.getByText("Source:").parentElement).toHaveTextContent("Manual edit");
  });

  it("requires typed confirmation before clearing rows and stages rather than saving", async () => {
    const api = setupApi();
    renderPage();
    await waitForInitialRoster();

    fireEvent.click(screen.getByRole("button", { name: "More roster actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Clear roster rows/u }));
    const dialog = screen.getByRole("dialog", { name: "Clear roster rows" });
    const confirm = within(dialog).getByRole("button", { name: "Clear roster rows" });
    expect(confirm).toBeDisabled();
    expect(dialog).not.toHaveTextContent("/courses/csc1120");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Type 001 to confirm/u }), {
      target: { value: "001" }
    });
    fireEvent.click(confirm);

    expect(
      screen.getByText("2 student changes — 0 added, 2 removed, 0 changed")
    ).toBeInTheDocument();
    expect(api.saveRoster).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Review and save" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    const review = await screen.findByRole("dialog", { name: "Review roster changes" });
    fireEvent.click(within(review).getByRole("button", { name: "Save roster" }));
    await waitFor(() =>
      expect(api.saveRoster).toHaveBeenCalledWith(
        expect.objectContaining({ rows: [], sourceKind: "manual_edit", confirmed: true })
      )
    );
    expect(screen.getByText("This is a valid empty roster.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More roster actions" }));
    expect(screen.getByRole("menuitem", { name: /Remove roster/u })).not.toBeDisabled();
  });

  it("removes only the roster, keeps the selected section and faculty, and refreshes summaries", async () => {
    const getRosterSectionSummaries = vi
      .fn()
      .mockResolvedValueOnce({
        status: "ready",
        summaries: [
          readySummary("001", 2),
          { sectionId: "002", status: "missing", exists: false, diagnostics: [] },
          {
            sectionId: "003",
            status: "invalid",
            exists: true,
            diagnostics: [{ code: "bad_roster", message: "Roster needs repair." }]
          }
        ],
        diagnostics: []
      })
      .mockResolvedValue({
        status: "ready",
        summaries: [
          { sectionId: "001", status: "missing", exists: false, diagnostics: [] },
          { sectionId: "002", status: "missing", exists: false, diagnostics: [] },
          {
            sectionId: "003",
            status: "invalid",
            exists: true,
            diagnostics: [{ code: "bad_roster", message: "Roster needs repair." }]
          }
        ],
        diagnostics: []
      });
    const api = setupApi({ getRosterSectionSummaries });
    renderPage();
    await waitForInitialRoster();

    fireEvent.click(screen.getByRole("button", { name: "More roster actions" }));
    expect(screen.getByRole("menuitem", { name: /Remove roster/u })).toHaveTextContent(
      "Removes the roster and keeps the section"
    );
    expect(screen.getByRole("menuitem", { name: /Remove section/u })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Remove roster/u }));
    const dialog = screen.getByRole("dialog", { name: "Remove roster" });
    expect(dialog).toHaveTextContent("removes the roster and student list for section 001");
    expect(dialog).toHaveTextContent("section and its faculty remain configured");
    expect(dialog).toHaveTextContent("Student repositories and published reports are not deleted");
    expect(dialog).not.toHaveTextContent("terms/27s1");
    expect(within(dialog).getByRole("button", { name: "Remove roster" })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Type 001 to confirm/u }), {
      target: { value: "001" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove roster" }));

    await waitFor(() => expect(api.removeRoster).toHaveBeenCalledOnce());
    expect(api.getRosterSectionSummaries).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Roster removed.")).toHaveAttribute("role", "status");
    expect(screen.getByRole("tab", { name: "Section 001, No roster" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("jones")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("ada")).not.toBeInTheDocument();
    expect(
      screen.getByText(/No roster has been created for this section yet/u)
    ).toBeInTheDocument();
    expect(screen.getByText("Source:").parentElement).toHaveTextContent("Not recorded");
    expect(screen.queryByRole("button", { name: "Review and save" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add student" })).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Replace from CSV" })).toBeEnabled();
    expect(screen.getByLabelText("Roster CSV file")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "More roster actions" }));
    expect(screen.getByRole("menuitem", { name: /Remove roster/u })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /Remove section/u })).toBeEnabled();

    fireEvent.click(screen.getAllByRole("button", { name: "Add student" })[0]!);
    expect(screen.getByLabelText("Student ID for row 1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Faculty username"), { target: { value: "smith" } });
    fireEvent.click(screen.getByRole("button", { name: "Add faculty" }));
    expect(screen.getByText("smith")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review and save" })).toBeInTheDocument();
  });

  it("adopts local roster-only state when publication fails", async () => {
    const api = setupApi({
      removeRoster: vi.fn().mockResolvedValue({
        status: "success",
        path: "terms/27s1/rosters/section-001.csv",
        diagnostics: [{ message: "Push failed. Use Publish Course Changes to retry." }],
        publication: { status: "failure", diagnostics: [{ message: "Push failed." }] }
      })
    });
    renderPage();
    await waitForInitialRoster();
    fireEvent.click(screen.getByRole("button", { name: "More roster actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Remove roster/u }));
    const dialog = screen.getByRole("dialog", { name: "Remove roster" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Type 001 to confirm/u }), {
      target: { value: "001" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove roster" }));

    await waitFor(() => expect(api.removeRoster).toHaveBeenCalledOnce());
    expect(screen.getByRole("tab", { name: /Section 001/u })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("jones")).toBeInTheDocument();
    expect(
      screen.getByText(/No roster has been created for this section yet/u)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review and save" })).not.toBeInTheDocument();
    expect((await screen.findByText(/Saved locally/u)).parentElement).toHaveTextContent(
      "Publish Course Changes"
    );
  });

  it("creates a new section through the staged save flow and selects its new tab", async () => {
    const api = setupApi({
      saveRoster: vi.fn().mockResolvedValue({
        status: "success",
        path: "terms/27s1/rosters/section-004.csv",
        source: {
          kind: "manual_edit",
          updatedAt: "2026-09-23T15:30:00.000Z",
          updatedBy: "jones"
        },
        diagnostics: []
      })
    });
    renderPage();
    await waitForInitialRoster();
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    fireEvent.change(screen.getByLabelText("Section ID"), { target: { value: "004" } });
    expect(screen.getByText("New section has unsaved changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    const dialog = await screen.findByRole("dialog", { name: "Review roster changes" });
    expect(within(dialog).getByText("This will create the new section.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save roster" }));

    await waitFor(() =>
      expect(api.saveRoster).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: "004",
          createSection: true,
          sourceKind: "manual_edit",
          confirmed: true
        })
      )
    );
    expect(await screen.findByRole("tab", { name: "Section 004, Loading" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(api.getRosterSectionSummaries).toHaveBeenCalledTimes(2);
  });

  it("discards a new section draft without creating backend data", async () => {
    const api = setupApi();
    renderPage();
    await waitForInitialRoster();
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    fireEvent.change(screen.getByLabelText("Section ID"), { target: { value: "004" } });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.queryByRole("heading", { name: "New section" })).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue("ada")).toBeInTheDocument();
    expect(api.previewRosterSave).not.toHaveBeenCalled();
    expect(api.saveRoster).not.toHaveBeenCalled();
  });

  it("requires typed confirmation before removing a section and clears the section context", async () => {
    const api = setupApi();
    renderPage();
    await waitForInitialRoster();
    fireEvent.click(screen.getByRole("button", { name: "More roster actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Remove section/u }));
    const dialog = screen.getByRole("dialog", { name: "Remove section" });
    const confirm = within(dialog).getByRole("button", { name: "Remove section" });
    expect(confirm).toBeDisabled();
    expect(dialog).toHaveTextContent("removes section 001 from the term configuration");
    expect(dialog).toHaveTextContent("Student repositories and published reports are not deleted");
    expect(dialog).not.toHaveTextContent("terms/27s1");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Type 001 to confirm/u }), {
      target: { value: "001" }
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.removeSection).toHaveBeenCalledOnce());
    expect(api.getRosterSectionSummaries).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("tab", { name: /Section 001/u })).not.toBeInTheDocument();
    expect(screen.queryByText("jones")).not.toBeInTheDocument();
    expect(await screen.findByText("Section removed.")).toHaveAttribute("role", "status");
  });

  it("keeps filesystem paths only inside Technical details", async () => {
    setupApi();
    renderPage();
    await waitForInitialRoster();

    expect(
      screen.getByRole("heading", { name: "Manage rosters" }).parentElement
    ).not.toHaveTextContent(COURSE_FOLDER.path);
    const details = screen.getByText("Technical details").closest("details");
    expect(details).not.toBeNull();
    expect(details).toHaveTextContent("Roster pathterms/27s1/rosters/section-001.csv");
    expect(details).toHaveTextContent("Source metadata path");
    expect(details).toHaveTextContent(`Course folder path${COURSE_FOLDER.path}`);
  });
});
