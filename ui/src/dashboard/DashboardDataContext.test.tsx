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
    return (
      <div>
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
    <DashboardDataProvider>
      <View />
    </DashboardDataProvider>
  );
  expect(await screen.findByText("a loaded")).toBeInTheDocument();
  expect(screen.queryByText("b loaded")).not.toBeInTheDocument();
  state = { ...state, courseDiscovery: { ...state.courseDiscovery, status: "error" } };
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  expect(screen.getByText("a loaded")).toBeInTheDocument();
  expect(refreshCourseFolder).toHaveBeenCalledTimes(2);
  completeAll({ status: "success", results: [] });
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
