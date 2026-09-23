import type { BreadcrumbItem } from "../components/Breadcrumbs";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
import type { DashboardCard } from "./dashboardTypes";
import { getAssignmentDetailPath, toRouteSlug } from "./routePaths";

/**
 * Every routed screen's breadcrumb trail starts the same way: a link back to
 * the dashboard, then the course/term the screen belongs to. There is no
 * course-level page to link that second crumb to (README's PR10-1 decision:
 * the course page is a gap, not something this PR builds), so it renders as
 * a plain label, never a dead link.
 */
const buildCourseTermCrumb = (
  courseTitle: string | null,
  courseSlug: string | null,
  termTitle: string | null,
  termSlug: string | null
): BreadcrumbItem => ({
  label: `${courseTitle ?? courseSlug ?? "Course"} · ${termTitle ?? termSlug ?? "Term"}`
});

export const buildDashboardCrumb = (): BreadcrumbItem => ({ label: "Dashboard", to: "/" });

/** Breadcrumbs for the roster route: Dashboard > Course · Term > Roster. */
export const buildRosterBreadcrumbs = (card: DashboardCard): readonly BreadcrumbItem[] => [
  buildDashboardCrumb(),
  buildCourseTermCrumb(card.courseTitle, card.courseSlug, card.termTitle, card.termSlug),
  { label: "Roster" }
];

/** Breadcrumbs for the course-owned comment library's term access route. */
export const buildCommentLibraryBreadcrumbs = (card: DashboardCard): readonly BreadcrumbItem[] => [
  buildDashboardCrumb(),
  buildCourseTermCrumb(card.courseTitle, card.courseSlug, card.termTitle, card.termSlug),
  { label: "Comment Library" }
];

/**
 * Breadcrumbs for assignment-scoped routes: Dashboard > Course · Term >
 * Assignment title > (optional trailing label for the sub-screen).
 *
 * With no `trailingLabel`, the assignment title itself is the current page
 * (used by the assignment-detail route). With one, the assignment title
 * becomes a link back to assignment detail and the trailing label is current
 * -- used by every screen reached from assignment detail (grading, apply
 * preview, grade preview, status, report, edit). A screen reachable from more
 * than one parent (faculty report can follow either assignment detail or
 * grade status) shows the more direct path, not every possible one --
 * breadcrumbs show a single canonical trail.
 */
export const buildAssignmentBreadcrumbs = (
  selection: AssignmentDetailSelection,
  trailingLabel?: string
): readonly BreadcrumbItem[] => {
  const courseSlug = toRouteSlug(selection.courseSlug);
  const termSlug = toRouteSlug(selection.termSlug);
  const assignmentSlug = toRouteSlug(selection.assignmentSlug);
  const assignmentTitle = selection.assignmentTitle ?? assignmentSlug;
  const assignmentPath = getAssignmentDetailPath(courseSlug, termSlug, assignmentSlug);

  const assignmentCrumb: BreadcrumbItem =
    trailingLabel === undefined
      ? { label: assignmentTitle }
      : { label: assignmentTitle, to: assignmentPath };

  const base: readonly BreadcrumbItem[] = [
    buildDashboardCrumb(),
    buildCourseTermCrumb(
      selection.courseTitle,
      selection.courseSlug,
      selection.termTitle,
      selection.termSlug
    ),
    assignmentCrumb
  ];

  return trailingLabel === undefined ? base : [...base, { label: trailingLabel }];
};
