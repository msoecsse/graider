import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("inspects cached course/term/assignment metadata by ID and offers no mutation", async () => {
    const inspectManagedCourse = vi.fn().mockResolvedValue({
      repositoryId: course.repositoryId,
      code: course.code,
      title: course.title,
      terms: ["27s1"],
      assignments: [{ term: "27s1", slug: "lab1", title: "First lab", status: "active" }]
    });
    Object.assign(window.graiderUI, { githubOAuth: { inspectManagedCourse } });
    show({
      ...state,
      courseDiscovery: {
        ...state.courseDiscovery,
        courses: [{ ...course, bootstrap: { status: "ready", diagnostic: null, retryable: false } }]
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect course" }));
    expect(await screen.findByText("First lab")).toBeInTheDocument();
    expect(inspectManagedCourse).toHaveBeenCalledWith(course.repositoryId);
    fireEvent.click(screen.getByRole("button", { name: "27s1" }));
    expect(screen.getByRole("button", { name: "27s1" })).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: /Publish|Apply|Grade|Reveal/ })
    ).not.toBeInTheDocument();
  });
  it("discards late inspection visibility on account switch even for the same repository", async () => {
    let finish!: (value: unknown) => void;
    const inspectManagedCourse = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    Object.assign(window.graiderUI, { githubOAuth: { inspectManagedCourse } });
    const ready = {
      ...state,
      courseDiscovery: {
        ...state.courseDiscovery,
        courses: [
          { ...course, bootstrap: { status: "ready" as const, diagnostic: null, retryable: false } }
        ]
      }
    };
    const { rerender } = render(
      <RemoteCoursesPanel state={ready} onRefresh={() => {}} onSettings={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Inspect course" }));
    rerender(
      <RemoteCoursesPanel
        state={{
          ...ready,
          identity: { id: 99, login: "other", name: null },
          courseDiscovery: { ...ready.courseDiscovery, userId: 99 }
        }}
        onRefresh={() => {}}
        onSettings={() => {}}
      />
    );
    finish({
      repositoryId: course.repositoryId,
      code: course.code,
      title: "Old account private metadata",
      terms: [],
      assignments: []
    });
    await waitFor(() => expect(inspectManagedCourse).toHaveBeenCalledOnce());
    expect(screen.queryByText(/Old account private metadata/)).not.toBeInTheDocument();
  });
  it.each([
    ["queued", "Course setup queued"],
    ["bootstrapping", "Setting up course…"],
    ["ready", "Cached locally"],
    ["failed", "Course setup failed"],
    ["needs_attention", "Needs attention"]
  ] as const)("shows %s on the same repository card", (status, label) => {
    const f = show({
      ...state,
      courseDiscovery: {
        ...state.courseDiscovery,
        courses: [
          { ...course, bootstrap: { status, diagnostic: null, retryable: status === "failed" } }
        ]
      }
    });
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    if (status === "failed") {
      fireEvent.click(screen.getByRole("button", { name: "Retry course setup" }));
      expect(f.onRefresh).toHaveBeenCalledOnce();
    }
    if (status === "needs_attention")
      expect(screen.queryByRole("button", { name: "Retry course setup" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reveal|Finder|Explorer/ })
    ).not.toBeInTheDocument();
  });
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

describe("managed synchronization dashboard state", () => {
  it.each([
    ["checking", "Checking…"],
    ["fetching", "Fetching…"],
    ["updating", "Updating…"],
    ["up_to_date", "Up to date"],
    ["updated", "Updated"],
    ["needs_attention", "Needs attention"],
    ["failed", "Course update failed"]
  ] as const)("shows actual %s state", (status, label) => {
    const f = show({
      ...state,
      courseDiscovery: {
        ...state.courseDiscovery,
        courses: [
          {
            ...course,
            bootstrap: { status: "ready", diagnostic: null, retryable: false },
            synchronization: {
              status,
              diagnostic:
                status === "needs_attention" ? "Managed cache has diverged from GitHub." : null,
              retryable: status === "failed"
            }
          }
        ]
      }
    });
    expect(screen.getByText(label)).toBeInTheDocument();
    if (status === "failed") {
      fireEvent.click(screen.getByRole("button", { name: "Retry synchronization" }));
      expect(f.onRefresh).toHaveBeenCalledOnce();
    }
    if (status === "needs_attention") {
      expect(screen.queryByRole("button", { name: "Inspect course" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Reset|Repair|Discard|Force/ })
      ).not.toBeInTheDocument();
    }
  });
  it("counts completed operations, including registered-course caches without duplicating cards", () => {
    show({
      ...state,
      courseDiscovery: {
        ...state.courseDiscovery,
        courses: [
          {
            ...course,
            synchronization: { status: "fetching", diagnostic: null, retryable: false }
          },
          {
            ...course,
            repositoryId: 124,
            localStatus: "registered_local",
            synchronization: { status: "up_to_date", diagnostic: null, retryable: false }
          },
          { ...course, repositoryId: 125, authorization: "not_authorized" }
        ]
      }
    });
    expect(screen.getByText("Updating courses — 1 of 2 complete")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });
  it("refreshes open managed metadata when a completed synchronization changes its version", async () => {
    const inspectManagedCourse = vi
      .fn()
      .mockResolvedValueOnce({
        repositoryId: 123,
        code: "CSC1020",
        title: "Before sync",
        terms: ["27s1"],
        assignments: []
      })
      .mockResolvedValue({
        repositoryId: 123,
        code: "CSC1020",
        title: "After sync",
        terms: ["27s1", "27s2"],
        assignments: []
      });
    Object.assign(window.graiderUI, { githubOAuth: { inspectManagedCourse } });
    const ready: GithubOAuthState = {
      ...state,
      courseDiscovery: {
        ...state.courseDiscovery,
        courses: [{ ...course, bootstrap: { status: "ready", diagnostic: null, retryable: false } }]
      }
    };
    const { rerender } = render(
      <RemoteCoursesPanel state={ready} onRefresh={() => {}} onSettings={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Inspect course" }));
    expect(await screen.findByText(/Before sync/)).toBeInTheDocument();
    rerender(
      <RemoteCoursesPanel
        state={{
          ...ready,
          courseDiscovery: {
            ...ready.courseDiscovery,
            courses: [
              {
                ...course,
                bootstrap: { status: "ready", diagnostic: null, retryable: false },
                synchronization: {
                  status: "updated",
                  lastSuccessfulAt: "2026-10-24T20:00:00Z",
                  diagnostic: null,
                  retryable: false
                }
              }
            ]
          }
        }}
        onRefresh={() => {}}
        onSettings={() => {}}
      />
    );
    expect(await screen.findByText(/After sync/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "27s2" })).toBeInTheDocument();
  });
});
