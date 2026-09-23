import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { AssignmentDetailPage } from "./AssignmentDetailPage";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { buildAssignmentBreadcrumbs } from "../dashboard/breadcrumbHelpers";
import { useDashboardData } from "../dashboard/DashboardDataContext";
import { RouteLoading, RouteNotFound } from "../dashboard/RouteNotFound";
import { useResolvedAssignmentSelection } from "../dashboard/useRouteResolution";
import {
  DASHBOARD_PATH,
  getApplyPreviewPath,
  getAssignmentEditPath,
  getCommentLibraryPath,
  getFacultyReportPath,
  getGradePreviewPath,
  getGradeStatusPath,
  getGradingWorkspacePath,
  toRouteSlug
} from "../dashboard/routePaths";

/**
 * Resolves `:courseSlug`/`:termSlug`/`:assignment` and renders
 * AssignmentDetailPage. Every forward action navigates to a sibling route
 * instead of setting DashboardPage state (README section 4.1) -- including
 * "preview grade," which still branches at click time between the grading
 * workspace and the grade-preview fallback exactly as DashboardPage's old
 * `onPreviewGrade` handler did, since `prepareGradingWorkspace` availability
 * is a build-time fact, not something tied to a particular assignment.
 */
export const AssignmentDetailRoute = (): ReactElement => {
  const resolution = useResolvedAssignmentSelection();
  const navigate = useNavigate();
  const { handleRefreshCourseFolder } = useDashboardData();

  if (resolution.status === "loading") return <RouteLoading />;
  if (resolution.status === "not_found") return <RouteNotFound reason={resolution.reason} />;

  const { value: selection } = resolution;
  const courseSlug = toRouteSlug(selection.courseSlug);
  const termSlug = toRouteSlug(selection.termSlug);
  const assignmentSlug = toRouteSlug(selection.assignmentSlug);

  return (
    <>
      <Breadcrumbs items={buildAssignmentBreadcrumbs(selection)} />
      <AssignmentDetailPage
        selection={selection}
        onEditAssignment={() => {
          navigate(getAssignmentEditPath(courseSlug, termSlug, assignmentSlug));
        }}
        onManageCommentLibrary={() => {
          navigate(getCommentLibraryPath(courseSlug, termSlug));
        }}
        onDeleted={() => {
          // Refresh before navigating, not after (the ordering bug 1 in
          // PR10-1c warns about): the dashboard has no placeholder for "this
          // row is being removed," so navigating first would show the
          // just-deleted assignment still listed until the refresh lands --
          // a stale-then-vanishing flash right after a destructive action
          // the user just confirmed. Awaiting first means the dashboard is
          // already correct the moment it renders.
          void handleRefreshCourseFolder(selection.courseFolderId).then(() => {
            navigate(DASHBOARD_PATH);
          });
        }}
        onPreviewApply={() => {
          navigate(getApplyPreviewPath(courseSlug, termSlug, assignmentSlug));
        }}
        onPreviewGrade={() => {
          if (typeof window.graiderUI.prepareGradingWorkspace === "function") {
            navigate(getGradingWorkspacePath(courseSlug, termSlug, assignmentSlug));
          } else {
            navigate(getGradePreviewPath(courseSlug, termSlug, assignmentSlug));
          }
        }}
        onViewFacultyReport={() => {
          navigate(getFacultyReportPath(courseSlug, termSlug, assignmentSlug));
        }}
        onViewGradeStatus={() => {
          navigate(getGradeStatusPath(courseSlug, termSlug, assignmentSlug));
        }}
      />
    </>
  );
};
