import { describe, expect, it } from "vitest";
import type { CourseFolderRecord } from "../../electron/ipc";
import {
  findAnyCardForFolder,
  findCombinedCard,
  findCourseFolderForCard,
  resolveAssignmentSelection,
  resolveCourseFolder
} from "./dashboardResolvers";
import type { CombinedDashboardCard } from "./dashboardTypes";

const COURSE_FOLDER: CourseFolderRecord = {
  id: "course-folder-csc1120",
  path: "/Users/sean/dev/csc1120",
  displayAlias: null,
  lastOpenedAt: "2026-06-09T19:30:00.000Z",
  lastRefreshedAt: null,
  lastDashboardStatus: null
};

const CARD: CombinedDashboardCard = {
  id: "course-folder-csc1120:27s1-csc1120:0",
  sourceFolderId: COURSE_FOLDER.id,
  sourceFolderPath: COURSE_FOLDER.path,
  sourceLastRefreshedAt: "2026-06-10T12:00:00.000Z",
  dashboardStatus: "success",
  card: {
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
    assignmentCount: 1,
    assignments: [
      {
        slug: "lab02",
        title: "Lab 02",
        status: "active",
        gradingEnabled: true,
        assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
        applyState: "not_applied",
        sections: ["001"],
        dueAt: null,
        needsAttention: false,
        diagnostics: []
      },
      {
        slug: "no-file",
        title: "No File Assignment",
        status: "active",
        gradingEnabled: false,
        assignmentFile: null,
        applyState: null,
        sections: [],
        dueAt: null,
        needsAttention: false,
        diagnostics: []
      }
    ],
    recentAssignments: [],
    diagnostics: []
  }
};

const SECOND_FOLDER_CARD: CombinedDashboardCard = {
  ...CARD,
  id: "course-folder-csc4641:27s1-csc4641:0",
  sourceFolderId: "course-folder-csc4641",
  sourceFolderPath: "/Users/sean/dev/csc4641",
  card: { ...CARD.card, courseSlug: "csc4641", courseTitle: "CSC4641" }
};

describe("findCombinedCard", () => {
  it("finds the card matching both courseSlug and termSlug", () => {
    expect(findCombinedCard([CARD, SECOND_FOLDER_CARD], "csc1120", "27s1")).toBe(CARD);
  });

  it("returns null when no card matches", () => {
    expect(findCombinedCard([CARD], "csc9999", "27s1")).toBeNull();
  });
});

describe("findAnyCardForFolder", () => {
  it("finds a card belonging to the given folder id", () => {
    expect(findAnyCardForFolder([CARD, SECOND_FOLDER_CARD], "course-folder-csc4641")).toBe(
      SECOND_FOLDER_CARD
    );
  });

  it("returns null when the folder has no cards yet (e.g. dashboard not refreshed)", () => {
    expect(findAnyCardForFolder([], "course-folder-csc1120")).toBeNull();
  });
});

describe("findCourseFolderForCard", () => {
  it("finds the registered folder a card belongs to", () => {
    expect(findCourseFolderForCard([COURSE_FOLDER], CARD)).toBe(COURSE_FOLDER);
  });

  it("returns null when the folder is no longer registered", () => {
    expect(findCourseFolderForCard([], CARD)).toBeNull();
  });
});

describe("resolveCourseFolder", () => {
  it("resolves courseSlug/termSlug to the registered folder", () => {
    expect(resolveCourseFolder([COURSE_FOLDER], [CARD], "csc1120", "27s1")).toBe(COURSE_FOLDER);
  });

  it("returns null for an unresolvable course/term", () => {
    expect(resolveCourseFolder([COURSE_FOLDER], [CARD], "does-not-exist", "27s1")).toBeNull();
  });
});

describe("resolveAssignmentSelection", () => {
  it("builds the same AssignmentDetailSelection shape a dashboard click would produce", () => {
    const result = resolveAssignmentSelection([COURSE_FOLDER], [CARD], "csc1120", "27s1", "lab02");

    expect(result).toEqual({
      status: "ready",
      selection: {
        courseFolderId: COURSE_FOLDER.id,
        courseFolderPath: COURSE_FOLDER.path,
        assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
        assignmentTitle: "Lab 02",
        assignmentSlug: "lab02",
        assignmentStatus: "active",
        courseTitle: "CSC1120",
        courseSlug: "csc1120",
        termTitle: "Spring 2027",
        termSlug: "27s1"
      }
    });
  });

  it("reports not_found with a course/term reason when the course or term doesn't match", () => {
    const result = resolveAssignmentSelection(
      [COURSE_FOLDER],
      [CARD],
      "does-not-exist",
      "27s1",
      "lab02"
    );

    expect(result).toEqual({
      status: "not_found",
      reason: "This course and term could not be found. It may have been removed."
    });
  });

  it("reports not_found with an assignment reason when the assignment slug doesn't match", () => {
    const result = resolveAssignmentSelection(
      [COURSE_FOLDER],
      [CARD],
      "csc1120",
      "27s1",
      "does-not-exist"
    );

    expect(result).toEqual({
      status: "not_found",
      reason: "This assignment could not be found. It may have been deleted or renamed."
    });
  });

  it("reports not_found when the matched assignment has no file path", () => {
    const result = resolveAssignmentSelection(
      [COURSE_FOLDER],
      [CARD],
      "csc1120",
      "27s1",
      "no-file"
    );

    expect(result).toEqual({
      status: "not_found",
      reason: "Assignment file path is unavailable for this dashboard row."
    });
  });
});
