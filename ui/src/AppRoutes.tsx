import type { ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { DashboardPage } from "./dashboard/DashboardPage";
import { RouteNotFound } from "./dashboard/RouteNotFound";
import { AssignmentDetailRoute } from "./assignment-detail/AssignmentDetailRoute";
import { AssignmentEditRoute } from "./assignment-edit/AssignmentEditRoute";
import { ApplyPreviewRoute } from "./apply-preview/ApplyPreviewRoute";
import { GradePreviewRoute } from "./grade-preview/GradePreviewRoute";
import { GradeStatusRoute } from "./grade-status/GradeStatusRoute";
import { FacultyReportRoute } from "./faculty-report/FacultyReportRoute";
import { GradingWorkspaceRoute } from "./grading-workspace/GradingWorkspaceRoute";
import { RosterManagerRoute } from "./roster-manager/RosterManagerRoute";

/**
 * The route table itself (README section 4.1), split out from `App.tsx` so
 * tests can mount it inside a `MemoryRouter` instead of the production
 * `HashRouter` without duplicating the route list.
 */
export const AppRoutes = (): ReactElement => (
  <Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/course/:courseSlug/:termSlug/roster" element={<RosterManagerRoute />} />
    <Route path="/course/:courseSlug/:termSlug/:assignment" element={<AssignmentDetailRoute />} />
    <Route path="/course/:courseSlug/:termSlug/:assignment/apply" element={<ApplyPreviewRoute />} />
    <Route
      path="/course/:courseSlug/:termSlug/:assignment/grade"
      element={<GradingWorkspaceRoute />}
    />
    <Route
      path="/course/:courseSlug/:termSlug/:assignment/grade-preview"
      element={<GradePreviewRoute />}
    />
    <Route path="/course/:courseSlug/:termSlug/:assignment/status" element={<GradeStatusRoute />} />
    <Route
      path="/course/:courseSlug/:termSlug/:assignment/report"
      element={<FacultyReportRoute />}
    />
    <Route
      path="/course/:courseSlug/:termSlug/:assignment/edit"
      element={<AssignmentEditRoute />}
    />
    <Route path="*" element={<RouteNotFound reason="There is no page at this address." />} />
  </Routes>
);
