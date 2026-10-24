import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RemoteCoursesPanel } from "./RemoteCoursesPanel";
import type { RemoteCourse } from "../../electron/remoteCourseTypes";
import type { GithubOAuthState } from "../../electron/githubOAuthTypes";
const course: RemoteCourse = {
  repositoryId: 123,
  nodeId: "R_123",
  organizationId: 10,
  organizationLogin: "org",
  name: "course",
  fullName: "org/course",
  url: "https://github.com/org/course",
  defaultBranch: "main",
  visibility: "private",
  archived: false,
  code: "CSC1020",
  title: "Data Structures",
  schemaVersion: 1,
  discoveryHints: ["topic"],
  authorization: "authorized",
  localStatus: "remote_only",
  localFolderIds: [],
  diagnostics: []
};
const state: GithubOAuthState = {
  status: "signed_in",
  busy: false,
  identity: { id: 42, login: "github-faculty", name: null },
  persistence: "secure",
  repositoryPermission: "available",
  organizationPermission: "available",
  organizationDiscovery: { status: "ready", organizations: [], stale: false, message: null },
  message: null,
  courseDiscovery: {
    status: "ready",
    userId: 42,
    discoveredAt: "now",
    courses: [course],
    diagnostics: []
  }
};
const show = (value: GithubOAuthState) => {
  const onRefresh = vi.fn();
  const onSettings = vi.fn();
  render(<RemoteCoursesPanel state={value} onRefresh={onRefresh} onSettings={onSettings} />);
  return { onRefresh, onSettings };
};
describe("remote dashboard course discovery", () => {
  it("shows authorized remote-only courses without a fake Open action", () => {
    const f = show(state);
    expect(screen.getByText("CSC1020 — Data Structures")).toBeInTheDocument();
    expect(screen.getByText("Available remotely")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Open/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh courses" }));
    expect(f.onRefresh).toHaveBeenCalledOnce();
  });
  it("does not duplicate registered local courses", () => {
    show({
      ...state,
      courseDiscovery: {
        ...state.courseDiscovery,
        courses: [{ ...course, localStatus: "registered_local", localFolderIds: ["local"] }]
      }
    });
    expect(screen.queryByText("CSC1020 — Data Structures")).not.toBeInTheDocument();
  });
  it("offers faculty identity configuration without granting course access", () => {
    const f = show({
      ...state,
      courseDiscovery: {
        ...state.courseDiscovery,
        courses: [{ ...course, authorization: "faculty_identity_required" }]
      }
    });
    expect(screen.getByText("Set your MSOE username to verify course access.")).toBeInTheDocument();
    expect(screen.queryByText("Available remotely")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set faculty MSOE username" }));
    expect(f.onSettings).toHaveBeenCalledOnce();
  });
  it("puts unauthorized courses in secondary diagnostics", () => {
    show({
      ...state,
      courseDiscovery: {
        ...state.courseDiscovery,
        courses: [{ ...course, authorization: "not_authorized" }]
      }
    });
    expect(screen.queryByText("CSC1020 — Data Structures")).not.toBeInTheDocument();
    expect(screen.getByText(/no assigned sections/)).toBeInTheDocument();
  });
  it("never renders a previous account's private discovery snapshot", () => {
    show({ ...state, identity: { id: 99, login: "other", name: null } });
    expect(screen.queryByText("CSC1020 — Data Structures")).not.toBeInTheDocument();
  });
  it("clears remote course display on sign-out", () => {
    show({ ...state, identity: null, status: "signed_out" });
    expect(screen.queryByText("CSC1020 — Data Structures")).not.toBeInTheDocument();
  });
  it("offers an authorization upgrade for read:org-only sign-in", () => {
    const f = show({
      ...state,
      repositoryPermission: "required",
      courseDiscovery: { ...state.courseDiscovery, status: "authorization_required", courses: [] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Authorize course access" }));
    expect(f.onSettings).toHaveBeenCalledOnce();
  });
});
