import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { GradeStatusPage } from "./GradeStatusPage";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { buildAssignmentBreadcrumbs } from "../dashboard/breadcrumbHelpers";
import { RouteLoading, RouteNotFound } from "../dashboard/RouteNotFound";
import { useResolvedAssignmentSelection } from "../dashboard/useRouteResolution";
import { getFacultyReportPath, toRouteSlug } from "../dashboard/routePaths";

export const GradeStatusRoute = (): ReactElement => {
  const resolution = useResolvedAssignmentSelection();
  const navigate = useNavigate();

  if (resolution.status === "loading") return <RouteLoading />;
  if (resolution.status === "not_found") return <RouteNotFound reason={resolution.reason} />;

  const { value: selection } = resolution;
  const courseSlug = toRouteSlug(selection.courseSlug);
  const termSlug = toRouteSlug(selection.termSlug);
  const assignmentSlug = toRouteSlug(selection.assignmentSlug);

  return (
    <>
      <Breadcrumbs items={buildAssignmentBreadcrumbs(selection, "Status")} />
      <GradeStatusPage
        selection={selection}
        assignmentDetail={null}
        onViewFacultyReport={() => {
          navigate(getFacultyReportPath(courseSlug, termSlug, assignmentSlug));
        }}
      />
    </>
  );
};
