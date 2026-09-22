import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { GradingWorkspacePage } from "./GradingWorkspacePage";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { buildAssignmentBreadcrumbs } from "../dashboard/breadcrumbHelpers";
import { RouteLoading, RouteNotFound } from "../dashboard/RouteNotFound";
import { useResolvedAssignmentSelection } from "../dashboard/useRouteResolution";
import { getGradePreviewPath, toRouteSlug } from "../dashboard/routePaths";

/**
 * The old `onPreviewGrade` handler only ever set `gradingSelection` when
 * `window.graiderUI.prepareGradingWorkspace` existed, so this route can only
 * be reached from AssignmentDetailRoute in a build where it does. A direct
 * or deep-linked visit is the one new way to hit it without that guarantee,
 * so it redirects to the grade-preview fallback instead of rendering a
 * workspace the build doesn't support.
 */
export const GradingWorkspaceRoute = (): ReactElement => {
  const resolution = useResolvedAssignmentSelection();

  if (resolution.status === "loading") return <RouteLoading />;
  if (resolution.status === "not_found") return <RouteNotFound reason={resolution.reason} />;

  const { value: selection } = resolution;

  if (
    selection.termSlug === null ||
    selection.assignmentSlug === null ||
    typeof window.graiderUI.prepareGradingWorkspace !== "function"
  ) {
    const courseSlug = toRouteSlug(selection.courseSlug);
    const termSlug = toRouteSlug(selection.termSlug);
    const assignmentSlug = toRouteSlug(selection.assignmentSlug);

    return <Navigate to={getGradePreviewPath(courseSlug, termSlug, assignmentSlug)} replace />;
  }

  return (
    <>
      <Breadcrumbs items={buildAssignmentBreadcrumbs(selection, "Grade")} />
      <GradingWorkspacePage
        request={{
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          termCode: selection.termSlug,
          assignmentSlug: selection.assignmentSlug
        }}
      />
    </>
  );
};
