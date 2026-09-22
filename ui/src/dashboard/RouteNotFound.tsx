import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";

/**
 * README section 2.5: "one plain sentence, the reason, what to do" -- shown
 * when a route's slugs don't resolve to real data (a deleted assignment, a
 * stale link), never a blank screen or a crash. `reason` is the plain
 * sentence; the fix offered is always the same, since there is only one
 * place slugs can be re-resolved from: the dashboard.
 */
export const RouteNotFound = ({ reason }: { readonly reason: string }): ReactElement => {
  const navigate = useNavigate();

  return (
    <main className="dashboard-shell" aria-label="Page not found">
      <section className="dashboard-content" aria-label="Route not found">
        <EmptyState
          title="This page could not be found."
          description={reason}
          action={{ label: "Return to dashboard", onClick: () => navigate("/") }}
        />
      </section>
    </main>
  );
};

/** Shown while the shared dashboard cache is still loading, before "not found" can be decided. */
export const RouteLoading = (): ReactElement => (
  <main className="dashboard-shell" aria-label="Loading">
    <section className="dashboard-content" aria-label="Loading">
      <p className="loading-state">Loading course data...</p>
    </section>
  </main>
);
