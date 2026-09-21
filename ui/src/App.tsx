import type { ReactElement } from "react";
import { HashRouter } from "react-router-dom";
import { DashboardDataProvider } from "./dashboard/DashboardDataContext";
import { RouteErrorBoundary } from "./dashboard/RouteErrorBoundary";
import { AppRoutes } from "./AppRoutes";

/**
 * README section 4.1's router. Loaded via `file://` in production
 * (ui/electron/main.ts's `window.loadFile`), which rules out BrowserRouter --
 * it needs a server able to resolve any path to index.html, and `file://` has
 * no server. HashRouter keeps the whole route in the URL fragment
 * (`#/course/...`), which `file://` serves unchanged; MemoryRouter would work
 * too but gives up the one thing routing is for here, a URL that identifies
 * where you are. Neither gives a *shareable* link outside this window --
 * that needs a registered custom protocol and an `open-url` handler in
 * main.ts, which is out of scope for this PR (see the PR10-1 summary).
 *
 * The route table itself lives in `AppRoutes.tsx`, so tests can mount the
 * same routes inside a `MemoryRouter` instead of duplicating the list.
 */
export const App = (): ReactElement => (
  <DashboardDataProvider>
    <HashRouter>
      <RouteErrorBoundary>
        <AppRoutes />
      </RouteErrorBoundary>
    </HashRouter>
  </DashboardDataProvider>
);
