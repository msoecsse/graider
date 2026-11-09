import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useResolvedCourseFolder } from "./useRouteResolution";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DashboardDataProvider, useDashboardData } from "./DashboardDataContext";
import type { GithubOAuthState } from "../../electron/githubOAuthTypes";
import type { CombinedDashboardResult, CourseFolderDashboardResult } from "../../electron/ipc";

it("shows each local dashboard independently, preserves it during discovery, and rejects old account results", async () => {
  const template = await window.graiderUI.refreshCourseFolder("template");
  const folders = ["a", "b"].map((id) => ({
    id,
    path: id,
    displayAlias: null,
    lastOpenedAt: "",
    lastRefreshedAt: null,
    lastDashboardStatus: null
  }));
  let state: GithubOAuthState = {
    status: "signed_in",
    busy: false,
    identity: { id: 42, login: "faculty", name: null },
    persistence: "secure",
    message: null,
    repositoryPermission: "available",
    organizationPermission: "available",
    organizationDiscovery: { status: "ready", organizations: [], stale: false, message: null },
    courseDiscovery: {
      status: "loading",
      userId: 42,
      discoveredAt: null,
      diagnostics: [],
      courses: folders.map((folder, index) => ({
        repositoryId: index + 1,
        organizationId: 10,
        nodeId: null,
        organizationLogin: "fixture",
        name: folder.id,
        fullName: `fixture/${folder.id}`,
        url: `https://github.com/fixture/${folder.id}`,
        defaultBranch: "main",
        visibility: "private",
        archived: false,
        code: folder.id,
        title: folder.id,
        schemaVersion: 1,
        localStatus: "registered_local",
        localFolderIds: [folder.id],
        authorization: "unavailable",
        freshness: "cached",
        discoveryHints: [],
        diagnostics: []
      }))
    }
  };
  let completeAll!: (result: CombinedDashboardResult) => void;
  let completeOther!: (result: CourseFolderDashboardResult) => void;
  const get = vi.fn(async () => state);
  const refreshDashboard = vi.fn(
    () =>
      new Promise<CombinedDashboardResult>((resolve) => {
        completeAll = resolve;
      })
  );
  const refreshCourseFolder = vi.fn(async (id: string) =>
    id === "a"
      ? { ...template, courseFolderId: id }
      : await new Promise<CourseFolderDashboardResult>((resolve) => {
          completeOther = resolve;
        })
  );
  Object.assign(window.graiderUI, {
    listCourseFolders: vi.fn().mockResolvedValue(folders),
    refreshDashboard,
    refreshCourseFolder,
    githubOAuth: { get }
  });
  const View = () => {
    const data = useDashboardData();
    const route = useResolvedCourseFolder();
    return (
      <div>
        <span>Course route {route.status}</span>
        <span>{data.isRefreshingAll ? "combined pending" : "combined settled"}</span>
        <button onClick={() => data.acceptGithubAccount(state.identity?.id ?? null)}>
          Apply account
        </button>
        {Object.keys(data.refreshResults).map((id) => (
          <span key={id}>{id} loaded</span>
        ))}
      </div>
    );
  };
  render(
    <MemoryRouter initialEntries={["/b/27s1"]}>
      <DashboardDataProvider>
        <Routes>
          <Route path="/:courseSlug/:termSlug" element={<View />} />
        </Routes>
      </DashboardDataProvider>
    </MemoryRouter>
  );
  expect(await screen.findByText("a loaded")).toBeInTheDocument();
  expect(screen.queryByText("b loaded")).not.toBeInTheDocument();
  state = { ...state, courseDiscovery: { ...state.courseDiscovery, status: "error" } };
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  expect(screen.getByText("a loaded")).toBeInTheDocument();
  expect(refreshCourseFolder).toHaveBeenCalledTimes(2);
  completeAll({ status: "success", results: [] });
  await screen.findByText("combined settled");
  expect(screen.getByText("Course route loading")).toBeInTheDocument();
  expect(screen.getByText("a loaded")).toBeInTheDocument();
  refreshDashboard.mockResolvedValue({ status: "success", results: [] });
  state = {
    ...state,
    identity: { id: 43, login: "other", name: null },
    courseDiscovery: { ...state.courseDiscovery, userId: 43, courses: [] }
  };
  fireEvent.click(screen.getByRole("button", { name: "Apply account" }));
  expect(screen.queryByText("a loaded")).not.toBeInTheDocument();
  state = { ...state, identity: { id: 42, login: "faculty", name: null } };
  fireEvent.click(screen.getByRole("button", { name: "Apply account" }));
  await act(async () => {
    completeOther({ ...template, courseFolderId: "b" });
    await Promise.resolve();
  });
  expect(screen.queryByText("b loaded")).not.toBeInTheDocument();
});

it("keeps cached assignments navigable while background refresh is pending and after failure", async () => {
  window.location.hash = "#/course/cached/27s1";
  const cached: CourseFolderDashboardResult = {
    courseFolderId: "cached",
    courseFolderPath: "cached-path",
    status: "success",
    error: null,
    refreshedAt: "2026-01-01T00:00:00Z",
    dashboard: {
      schemaVersion: 1,
      commandName: "dashboard",
      status: "cached",
      exitCode: 0,
      summary: {},
      diagnostics: [],
      cards: [
        { courseSlug: "cached", termSlug: "27s1", assignments: [{ slug: "lab1", title: "Lab 1" }] }
      ]
    }
  };
  let complete!: (result: CourseFolderDashboardResult) => void;
  const background = vi.fn(
    () =>
      new Promise<CourseFolderDashboardResult>((resolve) => {
        complete = resolve;
      })
  );
  const manual = vi.fn().mockResolvedValue({ status: "success", results: [] });
  Object.assign(window.graiderUI, {
    listCourseFolders: vi.fn().mockResolvedValue([]),
    loadDashboardDisplay: vi.fn().mockResolvedValue({ status: "success", results: [cached] }),
    refreshCourseDisplay: background,
    refreshDashboard: manual,
    githubOAuth: {
      get: vi.fn().mockResolvedValue({
        status: "signed_in",
        identity: { id: 42 },
        courseDiscovery: {
          courses: [
            {
              repositoryId: 20,
              localFolderIds: ["cached"],
              authorization: "unavailable"
            }
          ]
        }
      })
    }
  });
  const View = () => {
    const data = useDashboardData();
    const route = useResolvedCourseFolder();
    return (
      <>
        <span>Cached route {route.status}</span>
        <span>{data.aggregatedDashboard.cards[0]?.card.assignments[0]?.title}</span>
        <button
          onClick={() => {
            void data.handleRefreshDashboard();
          }}
        >
          Manual refresh
        </button>
      </>
    );
  };
  render(
    <MemoryRouter initialEntries={["/cached/27s1"]}>
      <DashboardDataProvider>
        <Routes>
          <Route path="/:courseSlug/:termSlug" element={<View />} />
        </Routes>
      </DashboardDataProvider>
    </MemoryRouter>
  );
  expect(await screen.findByText("Lab 1")).toBeInTheDocument();
  expect(screen.getByText("Cached route ready")).toBeInTheDocument();
  await waitFor(() => expect(background).toHaveBeenCalledOnce());
  expect(window.graiderUI.loadDashboardDisplay).toHaveBeenCalledWith("cached");
  window.location.hash = "";
  expect(manual).not.toHaveBeenCalled();
  await act(async () => {
    complete({ ...cached, status: "failure", dashboard: null });
  });
  expect(screen.getByText("Lab 1")).toBeInTheDocument();
  expect(screen.getByText("Cached route ready")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Manual refresh"));
  await waitFor(() => expect(manual).toHaveBeenCalledOnce());
});
