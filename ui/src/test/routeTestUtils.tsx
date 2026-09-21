import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardDataProvider } from "../dashboard/DashboardDataContext";
import { RouteErrorBoundary } from "../dashboard/RouteErrorBoundary";
import { AppRoutes } from "../AppRoutes";

/**
 * Renders the real route tree (`AppRoutes`, the same one `App.tsx` mounts in
 * production) inside a `MemoryRouter` started at `initialPath`, wrapped in
 * the same `DashboardDataProvider` every route resolves its slugs against.
 * Use this for anything that needs `useParams()` to be populated (a route
 * wrapper) or that navigates and expects the destination route to actually
 * render (breadcrumb clicks, forward actions).
 */
export const renderAtRoute = (initialPath: string): RenderResult =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <DashboardDataProvider>
        <RouteErrorBoundary>
          <AppRoutes />
        </RouteErrorBoundary>
      </DashboardDataProvider>
    </MemoryRouter>
  );

/**
 * Renders a single element inside `DashboardDataProvider` + a bare
 * `MemoryRouter` (no route matching), for a component that calls
 * `useNavigate()`/`useDashboardData()` but does not itself read
 * `useParams()` -- `DashboardPage` is the only such case.
 */
export const renderWithProviders = (ui: ReactElement, initialPath = "/"): RenderResult =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <DashboardDataProvider>{ui}</DashboardDataProvider>
    </MemoryRouter>
  );
