import type { ReactElement } from "react";
import { RosterManagerPage } from "./RosterManagerPage";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { buildRosterBreadcrumbs } from "../dashboard/breadcrumbHelpers";
import { useDashboardData } from "../dashboard/DashboardDataContext";
import { RouteLoading, RouteNotFound } from "../dashboard/RouteNotFound";
import { useResolvedCourseFolder } from "../dashboard/useRouteResolution";

export const RosterManagerRoute = (): ReactElement => {
  const resolution = useResolvedCourseFolder();
  const { handleRefreshCourseFolder } = useDashboardData();

  if (resolution.status === "loading") return <RouteLoading />;
  if (resolution.status === "not_found") return <RouteNotFound reason={resolution.reason} />;

  const { courseFolder, card } = resolution.value;

  return (
    <>
      <Breadcrumbs items={buildRosterBreadcrumbs(card.card)} />
      <RosterManagerPage
        courseFolder={courseFolder}
        onSaved={() => {
          void handleRefreshCourseFolder(courseFolder.id);
        }}
      />
    </>
  );
};
