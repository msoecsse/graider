import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderAtRoute } from "../test/routeTestUtils";

const courseFolder = {
  id: "course-folder-csc1120",
  path: "/Users/sean/dev/csc1120",
  displayAlias: null,
  lastOpenedAt: "2026-06-09T19:30:00.000Z",
  lastRefreshedAt: null,
  lastDashboardStatus: null
};

const card = {
  kind: "course-term",
  displayName: "27s1-csc1120",
  courseSlug: "csc1120",
  courseTitle: "CSC1120",
  coursePath: ".",
  termSlug: "27s1",
  termTitle: "Spring 2027",
  status: "active",
  needsAttention: false,
  attentionCount: 0,
  roster: null,
  assignmentCount: 0,
  assignments: [],
  recentAssignments: [],
  diagnostics: []
};

const mockGraiderUI = (): void => {
  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: {
      listCourseFolders: vi.fn().mockResolvedValue([courseFolder]),
      refreshDashboard: vi.fn().mockResolvedValue({
        status: "success",
        results: [
          {
            courseFolderId: courseFolder.id,
            courseFolderPath: courseFolder.path,
            status: "success",
            dashboard: {
              schemaVersion: 1,
              commandName: "dashboard",
              status: "success",
              exitCode: 0,
              diagnostics: [],
              summary: { cardCount: 1 },
              cards: [card]
            },
            error: null,
            refreshedAt: "2026-06-10T12:00:00.000Z"
          }
        ]
      }),
      loadGradingCommentLibrary: vi.fn().mockResolvedValue({ status: "success", comments: [] })
    }
  });
};

describe("CommentLibraryRoute", () => {
  it("uses the dedicated static route and course-term breadcrumb", async () => {
    mockGraiderUI();
    renderAtRoute("/course/csc1120/27s1/comment-library");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Comment Library" })
    ).toBeInTheDocument();
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(breadcrumb).getByText("Comment Library")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("This page could not be found.")).not.toBeInTheDocument();
  });

  it("shows route-not-found for an unknown course term", async () => {
    mockGraiderUI();
    renderAtRoute("/course/missing/27s1/comment-library");

    expect(await screen.findByText("This page could not be found.")).toBeInTheDocument();
  });
});
