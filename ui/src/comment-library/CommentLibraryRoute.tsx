import type { ReactElement } from "react";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { buildCommentLibraryBreadcrumbs } from "../dashboard/breadcrumbHelpers";
import { RouteLoading, RouteNotFound } from "../dashboard/RouteNotFound";
import { useResolvedCourseFolder } from "../dashboard/useRouteResolution";
import { CommentLibraryPage } from "./CommentLibraryPage";

export const CommentLibraryRoute = (): ReactElement => {
  const resolution = useResolvedCourseFolder();
  if (resolution.status === "loading") return <RouteLoading />;
  if (resolution.status === "not_found") return <RouteNotFound reason={resolution.reason} />;

  const { card, courseFolder } = resolution.value;
  const termCode = card.card.termSlug;
  if (termCode === null || termCode.trim() === "")
    return (
      <RouteNotFound reason="This course term has no valid term context for the shared comment library." />
    );
  const courseLabel = card.card.courseTitle ?? card.card.courseSlug ?? "Course";
  const termLabel = card.card.termTitle ?? termCode;

  return (
    <>
      <Breadcrumbs items={buildCommentLibraryBreadcrumbs(card.card)} />
      <CommentLibraryPage
        courseFolderId={courseFolder.id}
        courseTermLabel={`${courseLabel} · ${termLabel}`}
        termCode={termCode}
      />
    </>
  );
};
