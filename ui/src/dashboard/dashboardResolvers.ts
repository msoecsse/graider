import type { CourseFolderRecord } from "../../electron/ipc";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
import type { CombinedDashboardCard, RecentAssignmentSummary } from "./dashboardTypes";

/**
 * Router params carry slugs, not objects (README section 4.1). Everything a
 * routed screen needs beyond those slugs -- courseFolderId, courseFolderPath,
 * assignmentFile -- already exists in the dashboard's aggregated cards, which
 * are loaded once and shared through DashboardDataContext. These functions
 * are the one place that turns a slug into the real identifiers a screen
 * needs, so no route wrapper re-implements the lookup.
 */
export const findCombinedCard = (
  cards: readonly CombinedDashboardCard[],
  courseSlug: string,
  termSlug: string
): CombinedDashboardCard | null =>
  cards.find((card) => card.card.courseSlug === courseSlug && card.card.termSlug === termSlug) ??
  null;

/**
 * A registered folder can produce more than one card (one dashboard result
 * can hold several course/term cards), so there is no single "the" card for
 * a folder in general. Callers that only have a folder -- the group-level
 * "Manage Rosters" actions, which act on the whole folder rather than one
 * term -- use the first card as the folder's route identity. Roster
 * management itself is folder-scoped (RosterManagerPage picks its own term
 * internally), so this only decides which slugs appear in the URL, not what
 * the page then lets the faculty member do.
 */
export const findAnyCardForFolder = (
  cards: readonly CombinedDashboardCard[],
  courseFolderId: string
): CombinedDashboardCard | null =>
  cards.find((card) => card.sourceFolderId === courseFolderId) ?? null;

export const findCourseFolderForCard = (
  courseFolders: readonly CourseFolderRecord[],
  card: CombinedDashboardCard
): CourseFolderRecord | null =>
  courseFolders.find((courseFolder) => courseFolder.id === card.sourceFolderId) ?? null;

/**
 * Resolves a course folder from courseSlug/termSlug alone, for routes (like
 * the roster manager) that need the registered folder but not a specific
 * assignment.
 */
export const resolveCourseFolder = (
  courseFolders: readonly CourseFolderRecord[],
  cards: readonly CombinedDashboardCard[],
  courseSlug: string,
  termSlug: string
): CourseFolderRecord | null => {
  const card = findCombinedCard(cards, courseSlug, termSlug);

  return card === null ? null : findCourseFolderForCard(courseFolders, card);
};

const findAssignmentSummary = (
  card: CombinedDashboardCard,
  assignmentSlug: string
): RecentAssignmentSummary | null =>
  card.card.assignments.find((assignment) => assignment.slug === assignmentSlug) ?? null;

export type AssignmentSelectionResolution =
  | { readonly status: "ready"; readonly selection: AssignmentDetailSelection }
  | { readonly status: "not_found"; readonly reason: string };

/**
 * Resolves the same AssignmentDetailSelection shape DashboardPage's
 * handleOpenAssignmentDetail already builds when a card's assignment button
 * is clicked -- reused here so a routed screen resolves to the identical
 * object a click-driven navigation would have produced.
 */
export const resolveAssignmentSelection = (
  courseFolders: readonly CourseFolderRecord[],
  cards: readonly CombinedDashboardCard[],
  courseSlug: string,
  termSlug: string,
  assignmentSlug: string
): AssignmentSelectionResolution => {
  const card = findCombinedCard(cards, courseSlug, termSlug);

  if (card === null) {
    return {
      status: "not_found",
      reason: "This course and term could not be found. It may have been removed."
    };
  }

  const assignment = findAssignmentSummary(card, assignmentSlug);

  if (assignment === null) {
    return {
      status: "not_found",
      reason: "This assignment could not be found. It may have been deleted or renamed."
    };
  }

  if (assignment.assignmentFile === null) {
    return {
      status: "not_found",
      reason: "Assignment file path is unavailable for this dashboard row."
    };
  }

  return {
    status: "ready",
    selection: {
      courseFolderId: card.sourceFolderId,
      courseFolderPath: card.sourceFolderPath,
      assignmentFile: assignment.assignmentFile,
      assignmentTitle: assignment.title,
      assignmentSlug: assignment.slug,
      assignmentStatus: assignment.status,
      courseTitle: card.card.courseTitle,
      courseSlug: card.card.courseSlug,
      termTitle: card.card.termTitle,
      termSlug: card.card.termSlug
    }
  };
};
