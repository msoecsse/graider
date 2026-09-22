import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { AssignmentEditPage } from "./AssignmentEditPage";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { buildAssignmentBreadcrumbs } from "../dashboard/breadcrumbHelpers";
import { RouteLoading, RouteNotFound } from "../dashboard/RouteNotFound";
import { useResolvedAssignmentSelection } from "../dashboard/useRouteResolution";
import { getAssignmentDetailPath, toRouteSlug } from "../dashboard/routePaths";

export const AssignmentEditRoute = (): ReactElement => {
  const resolution = useResolvedAssignmentSelection();
  const navigate = useNavigate();

  if (resolution.status === "loading") return <RouteLoading />;
  if (resolution.status === "not_found") return <RouteNotFound reason={resolution.reason} />;

  const { value: selection } = resolution;
  const assignmentDetailPath = getAssignmentDetailPath(
    toRouteSlug(selection.courseSlug),
    toRouteSlug(selection.termSlug),
    toRouteSlug(selection.assignmentSlug)
  );

  return (
    <>
      <Breadcrumbs items={buildAssignmentBreadcrumbs(selection, "Edit")} />
      <AssignmentEditPage
        selection={selection}
        onBack={() => {
          navigate(assignmentDetailPath);
        }}
        onSaved={() => {
          navigate(assignmentDetailPath);
        }}
      />
    </>
  );
};
