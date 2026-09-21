import { Component, type ErrorInfo, type ReactElement, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";

interface RouteCrashBoundaryProps {
  readonly children: ReactNode;
  readonly onReturnToDashboard: () => void;
}

interface RouteCrashBoundaryState {
  readonly hasError: boolean;
}

/**
 * README section 2.5: a render throw from a routed screen must never blank
 * the whole app (PR10-1a -- a malformed IPC response crashed the entire
 * renderer with no way back but a manual reload). This is a class component
 * because only `componentDidCatch`/`getDerivedStateFromError` can catch a
 * render error; nothing else in the tree (including this component's own
 * `render`) can throw the same way, so the boundary cannot be taken down by
 * the crash it exists to catch.
 */
class RouteCrashBoundary extends Component<RouteCrashBoundaryProps, RouteCrashBoundaryState> {
  public override state: RouteCrashBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): RouteCrashBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Never swallow silently (README section 2.5): DevTools must still show
    // the real stack, even though the render error itself is now contained.
    console.error("Unhandled error rendering a routed screen.", error, info.componentStack);
  }

  public override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="dashboard-shell" aria-label="Page error">
        <section className="dashboard-content" aria-label="Page error">
          <EmptyState
            title="Something went wrong displaying this page."
            description="An unexpected error occurred while rendering this screen. Returning to the dashboard and trying again usually resolves this."
            action={{ label: "Return to dashboard", onClick: this.props.onReturnToDashboard }}
          />
        </section>
      </main>
    );
  }
}

/**
 * Keyed by pathname so a navigation away from the broken screen mounts a
 * fresh boundary (and remounts its children) rather than leaving the app
 * stuck on the fallback until a manual reload.
 */
export const RouteErrorBoundary = ({
  children
}: {
  readonly children: ReactNode;
}): ReactElement => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <RouteCrashBoundary key={location.pathname} onReturnToDashboard={() => navigate("/")}>
      {children}
    </RouteCrashBoundary>
  );
};
