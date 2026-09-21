import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { FacultyReportPage } from "./FacultyReportPage";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { buildAssignmentBreadcrumbs } from "../dashboard/breadcrumbHelpers";
import { RouteLoading, RouteNotFound } from "../dashboard/RouteNotFound";
import { useResolvedAssignmentSelection } from "../dashboard/useRouteResolution";
import { getGradeStatusPath, toRouteSlug } from "../dashboard/routePaths";

/**
 * Faculty report is reachable from both assignment detail and grade status
 * (README section 5.2's wiring, and the PR10-1 spec discussion), but a
 * breadcrumb trail shows one canonical path -- here, assignment detail, since
 * that is the trail this route's own breadcrumbs already show. "Back to
 * grading status" stays as a page-level button (not removed with the others)
 * because it is the only way back to status; no breadcrumb crumb represents
 * it.
 */
export const FacultyReportRoute = (): ReactElement => {
  const resolution = useResolvedAssignmentSelection();
  const navigate = useNavigate();

  if (resolution.status === "loading") return <RouteLoading />;
  if (resolution.status === "not_found") return <RouteNotFound reason={resolution.reason} />;

  const { value: selection } = resolution;

  return (
    <>
      <Breadcrumbs items={buildAssignmentBreadcrumbs(selection, "Report")} />
      <FacultyReportPage
        selection={selection}
        assignmentDetail={null}
        gradeStatus={null}
        onBackToGradeStatus={() => {
          navigate(
            getGradeStatusPath(
              toRouteSlug(selection.courseSlug),
              toRouteSlug(selection.termSlug),
              toRouteSlug(selection.assignmentSlug)
            )
          );
        }}
      />
    </>
  );
};
