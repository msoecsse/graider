import { useParams } from "react-router-dom";
import { useDashboardData } from "./DashboardDataContext";
import {
  findCombinedCard,
  resolveAssignmentSelection,
  resolveCourseFolder,
  type AssignmentSelectionResolution
} from "./dashboardResolvers";
import type { CourseFolderRecord } from "../../electron/ipc";
import type { CombinedDashboardCard } from "./dashboardTypes";

/**
 * The roster route needs the registered folder (to pass to RosterManagerPage)
 * and the matching card (its courseTitle/termTitle, for the breadcrumb trail
 * -- CourseFolderRecord itself carries no title, only a folder path).
 */
export interface ResolvedCourseFolder {
  readonly courseFolder: CourseFolderRecord;
  readonly card: CombinedDashboardCard;
}

/**
 * A route's data can be in one of three states, and every routed screen
 * needs to tell them apart (README section 2.5): still loading (the shared
 * dashboard cache hasn't finished its first load yet, so absence doesn't
 * mean "not found" yet), genuinely not found (a real, plain-English reason
 * to show), or ready (the resolved value to render with).
 */
export type RouteResolution<T> =
  | { readonly status: "loading" }
  | { readonly status: "not_found"; readonly reason: string }
  | { readonly status: "ready"; readonly value: T };

const isDashboardDataReady = (isLoadingFolders: boolean, hasRefreshResults: boolean): boolean =>
  !isLoadingFolders && hasRefreshResults;

/** Resolves `:courseSlug`/`:termSlug` from the current route into a registered course folder and its card. */
export const useResolvedCourseFolder = (): RouteResolution<ResolvedCourseFolder> => {
  const { courseSlug, termSlug } = useParams();
  const { courseFolders, aggregatedDashboard, isLoadingFolders } = useDashboardData();

  if (courseSlug === undefined || termSlug === undefined) {
    return { status: "not_found", reason: "This course and term could not be found." };
  }

  if (!isDashboardDataReady(isLoadingFolders, aggregatedDashboard.hasRefreshResults)) {
    return { status: "loading" };
  }

  const card = findCombinedCard(aggregatedDashboard.cards, courseSlug, termSlug);
  const courseFolder =
    card === null
      ? null
      : resolveCourseFolder(courseFolders, aggregatedDashboard.cards, courseSlug, termSlug);

  return card === null || courseFolder === null
    ? {
        status: "not_found",
        reason: "This course and term could not be found. It may have been removed."
      }
    : { status: "ready", value: { courseFolder, card } };
};

/** Resolves `:courseSlug`/`:termSlug`/`:assignment` from the current route into an AssignmentDetailSelection. */
export const useResolvedAssignmentSelection = (): RouteResolution<
  Extract<AssignmentSelectionResolution, { status: "ready" }>["selection"]
> => {
  const { courseSlug, termSlug, assignment } = useParams();
  const { courseFolders, aggregatedDashboard, isLoadingFolders, isRefreshingAll, refreshingId } =
    useDashboardData();

  if (courseSlug === undefined || termSlug === undefined || assignment === undefined) {
    return { status: "not_found", reason: "This assignment could not be found." };
  }

  if (!isDashboardDataReady(isLoadingFolders, aggregatedDashboard.hasRefreshResults)) {
    return { status: "loading" };
  }

  const resolution = resolveAssignmentSelection(
    courseFolders,
    aggregatedDashboard.cards,
    courseSlug,
    termSlug,
    assignment
  );

  if (resolution.status === "ready") {
    return { status: "ready", value: resolution.selection };
  }

  // The assignment's own card can exist while the assignment itself is
  // missing from it for a genuinely temporary reason: it was just created,
  // and the refresh that will add it to this card's assignment list is
  // still in flight (DashboardPage's onOpenAssignment fires that refresh
  // and navigates here without waiting for it). Reporting "not found"
  // while that refresh is running would be wrong -- "not found" means "we
  // looked and it isn't there," not "we haven't looked yet." Once the
  // refresh for this specific folder (or a refresh-all) lands, this either
  // resolves to "ready" or becomes a genuine "not_found".
  const card = findCombinedCard(aggregatedDashboard.cards, courseSlug, termSlug);
  if (isRefreshingAll || (card !== null && refreshingId === card.sourceFolderId)) {
    return { status: "loading" };
  }

  return { status: "not_found", reason: resolution.reason };
};
