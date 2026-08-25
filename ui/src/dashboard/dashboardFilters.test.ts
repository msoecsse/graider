import { describe, expect, it } from "vitest";
import type { CombinedDashboardCard, DashboardCard, FolderDashboardError } from "./dashboardTypes";
import { filterAndSortDashboardCards, filterFolderErrors } from "./dashboardFilters";

const createCard = (
  id: string,
  card: Partial<DashboardCard>,
  sourceLastRefreshedAt: string | null = "2026-06-10T12:00:00.000Z"
): CombinedDashboardCard => ({
  id,
  sourceFolderId: `folder-${id}`,
  sourceFolderPath: `/courses/${id}`,
  sourceLastRefreshedAt,
  dashboardStatus: "success",
  card: (() => {
    const recentAssignments = card.recentAssignments ?? [];

    return {
      kind: "course-term",
      displayName: id,
      courseSlug: id,
      courseTitle: id.toUpperCase(),
      coursePath: ".",
      termSlug: "27s1",
      termTitle: "Spring 2027",
      status: "active",
      needsAttention: false,
      attentionCount: 0,
      roster: null,
      assignmentCount: 0,
      recentAssignments,
      diagnostics: [],
      ...card,
      assignments: card.assignments ?? recentAssignments
    };
  })()
});

describe("dashboardFilters", () => {
  it("empty search shows all active cards", () => {
    const cards = [createCard("csc1120", {}), createCard("csc4641", {})];

    expect(filterAndSortDashboardCards(cards, "", "active", "course")).toHaveLength(2);
  });

  it("keeps no-assignment and not-applied assignment courses in the active view", () => {
    const cards = [
      createCard("new-course", { assignmentCount: 0, assignments: [], recentAssignments: [] }),
      createCard("not-applied", {
        assignments: [
          {
            slug: "lab01",
            title: "Lab 01",
            status: "active",
            assignmentFile: "assignment.yml",
            applyState: "not_applied",
            dueAt: null,
            needsAttention: false,
            diagnostics: []
          }
        ]
      }),
      createCard("invalid", { needsAttention: true })
    ];

    expect(
      filterAndSortDashboardCards(cards, "", "active", "course").map((card) => card.id)
    ).toEqual(["invalid", "new-course", "not-applied"]);
    expect(
      filterAndSortDashboardCards(cards, "", "needs-attention", "course").map((card) => card.id)
    ).toEqual(["invalid"]);
    expect(filterAndSortDashboardCards(cards, "", "all", "course")).toHaveLength(3);
  });

  it("search matches displayName, course title, term slug, assignment title, and source path", () => {
    const cards = [
      createCard("alpha", {
        displayName: "27s1-csc1120",
        courseTitle: "Programming",
        termSlug: "27s1",
        recentAssignments: [
          {
            slug: "lab02",
            title: "Queues Lab",
            status: "active",
            assignmentFile: "assignment.yml",
            dueAt: null,
            needsAttention: false,
            diagnostics: []
          }
        ]
      })
    ];

    expect(filterAndSortDashboardCards(cards, " csc1120 ", "active", "course")).toHaveLength(1);
    expect(filterAndSortDashboardCards(cards, "programming", "active", "course")).toHaveLength(1);
    expect(filterAndSortDashboardCards(cards, "27S1", "active", "course")).toHaveLength(1);
    expect(filterAndSortDashboardCards(cards, "queues", "active", "course")).toHaveLength(1);
    expect(filterAndSortDashboardCards(cards, "/courses/alpha", "active", "course")).toHaveLength(
      1
    );
    expect(filterAndSortDashboardCards(cards, "missing", "active", "course")).toHaveLength(0);
  });

  it("active excludes inactive and archived cards while all includes them", () => {
    const cards = [
      createCard("active", { status: "active" }),
      createCard("inactive", { status: "inactive" }),
      createCard("archived", { status: "archived" })
    ];

    expect(
      filterAndSortDashboardCards(cards, "", "active", "course").map((card) => card.id)
    ).toEqual(["active"]);
    expect(filterAndSortDashboardCards(cards, "", "all", "course")).toHaveLength(3);
  });

  it("needs attention includes card, assignment, and folder error attention states", () => {
    const cards = [
      createCard("normal", {}),
      createCard("card-attention", { needsAttention: true }),
      createCard("assignment-attention", {
        recentAssignments: [
          {
            slug: "lab02",
            title: "Lab 02",
            status: "active",
            assignmentFile: "assignment.yml",
            dueAt: null,
            needsAttention: true,
            diagnostics: []
          }
        ]
      })
    ];
    const folderErrors: FolderDashboardError[] = [
      {
        sourceFolderId: "folder-error",
        sourceFolderPath: "/courses/broken",
        code: "graider_cli_not_found",
        message: "Graider CLI not found.",
        details: []
      }
    ];

    expect(
      filterAndSortDashboardCards(cards, "", "needs-attention", "course").map((card) => card.id)
    ).toEqual(["assignment-attention", "card-attention"]);
    expect(filterFolderErrors(folderErrors, "", "needs-attention")).toHaveLength(1);
    expect(filterFolderErrors(folderErrors, "", "all")).toHaveLength(1);
    expect(filterFolderErrors(folderErrors, "", "active")).toHaveLength(1);
  });

  it("sorts by course, term, needs attention, recently refreshed, and newest assignment due date", () => {
    const cards = [
      createCard(
        "zeta",
        {
          courseTitle: "Zeta",
          termSlug: "27s2",
          needsAttention: true,
          attentionCount: 1,
          recentAssignments: [
            {
              slug: "old",
              title: "Old",
              status: "active",
              assignmentFile: "old.yml",
              dueAt: "2027-01-01T00:00:00.000Z",
              needsAttention: false,
              diagnostics: []
            }
          ]
        },
        "2026-06-09T12:00:00.000Z"
      ),
      createCard(
        "alpha",
        {
          courseTitle: "Alpha",
          termSlug: "27s1",
          needsAttention: true,
          attentionCount: 3,
          recentAssignments: [
            {
              slug: "new",
              title: "New",
              status: "active",
              assignmentFile: "new.yml",
              dueAt: "2027-06-01T00:00:00.000Z",
              needsAttention: false,
              diagnostics: []
            }
          ]
        },
        "2026-06-10T12:00:00.000Z"
      )
    ];

    expect(filterAndSortDashboardCards(cards, "", "all", "course").map((card) => card.id)).toEqual([
      "alpha",
      "zeta"
    ]);
    expect(filterAndSortDashboardCards(cards, "", "all", "term").map((card) => card.id)).toEqual([
      "alpha",
      "zeta"
    ]);
    expect(
      filterAndSortDashboardCards(cards, "", "all", "needs-attention").map((card) => card.id)
    ).toEqual(["alpha", "zeta"]);
    expect(
      filterAndSortDashboardCards(cards, "", "all", "recently-refreshed").map((card) => card.id)
    ).toEqual(["alpha", "zeta"]);
    expect(
      filterAndSortDashboardCards(cards, "", "all", "newest-first").map((card) => card.id)
    ).toEqual(["alpha", "zeta"]);
  });
});
