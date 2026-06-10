import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CourseFolderRecord, GraiderUIApi } from "../../electron/ipc";
import { DashboardPage } from "./DashboardPage";

const COURSE_FOLDER: CourseFolderRecord = {
  id: "course-folder-csc1120",
  path: "/Users/sean/dev/csc1120",
  displayAlias: null,
  lastOpenedAt: "2026-06-09T19:30:00.000Z",
  lastRefreshedAt: null,
  lastDashboardStatus: null
};

const SECOND_COURSE_FOLDER: CourseFolderRecord = {
  id: "course-folder-csc4641",
  path: "/Users/sean/dev/csc4641",
  displayAlias: null,
  lastOpenedAt: "2026-06-09T20:00:00.000Z",
  lastRefreshedAt: null,
  lastDashboardStatus: null
};

const mockGraiderUI = (api: Partial<GraiderUIApi>): GraiderUIApi => {
  const graiderUI = {
    getAppInfo: vi.fn().mockResolvedValue({ name: "Graider", version: "0.1.0" }),
    selectCourseFolder: vi.fn().mockResolvedValue({ canceled: true, courseFolder: null }),
    listCourseFolders: vi.fn().mockResolvedValue([]),
    removeCourseFolder: vi.fn().mockResolvedValue(undefined),
    ...api
  };

  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: graiderUI
  });

  return graiderUI;
};

const getFirstOpenCourseFolderButton = async (): Promise<HTMLElement> => {
  const openButtons = await screen.findAllByRole("button", { name: "Open course folder" });
  const openButton = openButtons[0];

  if (openButton === undefined) {
    throw new Error("Expected an Open course folder button.");
  }

  return openButton;
};

describe("DashboardPage", () => {
  it("renders the empty course state", async () => {
    render(<DashboardPage />);

    expect(screen.getByText("Graider")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "No courses added yet." })
    ).toBeInTheDocument();
    expect(screen.getByText("Open a Graider course folder to get started.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open course folder" })).toHaveLength(2);
  });

  it("keeps non-implemented dashboard controls disabled", async () => {
    render(<DashboardPage />);

    await screen.findByRole("heading", { level: 2, name: "No courses added yet." });

    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    expect(screen.getByRole("searchbox", { name: "Search" })).toBeDisabled();
  });

  it("renders registered folder records", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER, SECOND_COURSE_FOLDER])
    });

    render(<DashboardPage />);

    expect(await screen.findByText("Registered course folders")).toBeInTheDocument();
    expect(screen.getByText(COURSE_FOLDER.path)).toBeInTheDocument();
    expect(screen.getByText(SECOND_COURSE_FOLDER.path)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "No courses added yet." })).toBeNull();
  });

  it("clicking Open course folder calls the preload API", async () => {
    const selectCourseFolder = vi.fn().mockResolvedValue({ canceled: true, courseFolder: null });

    mockGraiderUI({ selectCourseFolder });
    render(<DashboardPage />);

    fireEvent.click(await getFirstOpenCourseFolderButton());

    await waitFor(() => {
      expect(selectCourseFolder).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole("heading", { level: 2, name: "No courses added yet." })
    ).toBeInTheDocument();
  });

  it("successful folder selection updates the visible list", async () => {
    mockGraiderUI({
      selectCourseFolder: vi.fn().mockResolvedValue({
        canceled: false,
        courseFolder: COURSE_FOLDER
      })
    });
    render(<DashboardPage />);

    fireEvent.click(await getFirstOpenCourseFolderButton());

    expect(await screen.findByText(COURSE_FOLDER.path)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "No courses added yet." })).toBeNull();
  });

  it("clicking Remove from dashboard removes the folder from the UI", async () => {
    const removeCourseFolder = vi.fn().mockResolvedValue(undefined);

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      removeCourseFolder
    });
    render(<DashboardPage />);

    expect(await screen.findByText(COURSE_FOLDER.path)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: `Remove ${COURSE_FOLDER.path} from dashboard` })
    );

    await waitFor(() => {
      expect(removeCourseFolder).toHaveBeenCalledWith(COURSE_FOLDER.id);
    });
    expect(screen.queryByText(COURSE_FOLDER.path)).toBeNull();
    expect(
      await screen.findByRole("heading", { level: 2, name: "No courses added yet." })
    ).toBeInTheDocument();
  });

  it("does not use delete wording for registry removal", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER])
    });

    render(<DashboardPage />);

    expect(
      await screen.findByRole("button", { name: `Remove ${COURSE_FOLDER.path} from dashboard` })
    ).toBeInTheDocument();
    expect(screen.queryByText("Delete")).toBeNull();
  });
});
