import { MIGRATION_STATUS_POLL_MS } from "../../electron/migrationExecutionTypes";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type {
  MigrationExecutionState,
  MigrationHistory
} from "../../electron/migrationExecutionTypes";
import { getMigrationReviewPath } from "../dashboard/routePaths";

const labels = {
  preparing: "Preparation",
  validating: "Validation",
  checkpointing: "Recovery checkpoint",
  publishing: "Publication",
  synchronizing: "Synchronization",
  reconciling: "Reconciliation",
  recovering: "Verifying publication outcome"
};
export const MigrationExecutionPanel = ({
  state,
  onState,
  onLeave
}: {
  readonly state: MigrationExecutionState;
  readonly onState: (state: MigrationExecutionState) => void;
  readonly onLeave?: () => void;
}): ReactElement => {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = state.active
    ? state.outcome === "outcome_unknown"
      ? "Publication outcome needs verification"
      : "Upgrading course"
    : state.outcome === "ready"
      ? "Ready"
      : state.published === true
        ? "Published — Needs attention"
        : "Not published";
  const invoke = async (action: "cancel" | "recover") => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await window.graiderUI.migrationExecution![action]({ selector: state.selector });
      onState(next);
      setError("");
    } catch {
      setError(
        "Refresh your account and course access, then check the authoritative status again."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="detail-panel migration-execution"
      aria-labelledby="migration-outcome"
      aria-busy={state.active}
    >
      <h2 id="migration-outcome">{title}</h2>
      <ol aria-label="Migration progress">
        {state.stages.map((stage) => (
          <li key={stage.phase} aria-current={stage.status === "running" ? "step" : undefined}>
            {labels[stage.phase]} — {stage.status.replaceAll("_", " ")}
          </li>
        ))}
      </ol>
      <p role="status">
        {state.action || `${labels[state.phase]} is running. Keep Graider open to follow progress.`}
      </p>
      {state.active ? (
        <>
          <p>
            Application navigation is unavailable while the transaction has an unresolved outcome.
            Closing or reloading the window does not cancel it.
          </p>
          <button
            className="secondary-action"
            type="button"
            disabled={!state.cancellable || busy}
            onClick={() => {
              void invoke("cancel");
            }}
          >
            Cancel upgrade
          </button>
          {!state.cancellable ? (
            <p>
              Cancellation is no longer available. Publication and its outcome must be verified by
              Graider.
            </p>
          ) : (
            <p>Cancellation is available during preparation and validation, before publication.</p>
          )}
        </>
      ) : null}
      {state.outcome === "outcome_unknown" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void invoke("recover");
          }}
        >
          Verify publication outcome
        </button>
      ) : null}
      {state.refreshRequired ? (
        <p>Schema 2 publication was accepted. Refresh courses to synchronize the course cache.</p>
      ) : null}
      {state.blockers.length > 0 ? (
        <ul aria-label="Upgrade blockers">
          {state.blockers.map((blocker, index) => (
            <li key={`${blocker.code}/${index}`}>{blocker.action}</li>
          ))}
        </ul>
      ) : null}
      {!state.active ? (
        <>
          {state.published === true ? (
            <Link
              onClick={onLeave}
              className="secondary-action"
              to={`/migration-history/${encodeURIComponent(state.selector)}`}
            >
              Migration History and recovery
            </Link>
          ) : (
            <Link
              onClick={onLeave}
              className="secondary-action"
              to={getMigrationReviewPath(state.selector)}
            >
              Reopen saved review and check course
            </Link>
          )}
          <Link onClick={onLeave} className="secondary-action" to="/">
            Return to course overview
          </Link>
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
};

/** This replaces all routes while a trusted operation is active, including after reload.
 * It is a navigation affordance; the backend remains the safety boundary. */
export const MigrationActivityGate = ({
  children
}: {
  readonly children: ReactNode;
}): ReactElement => {
  const [state, setState] = useState<MigrationExecutionState | null>(null);
  const [checking, setChecking] = useState(true);
  const tracked = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    let pending = false;
    const read = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await window.graiderUI.migrationExecution?.active();
        if (active && next) {
          tracked.current = next.selector;
          setState(next);
        } else if (active && tracked.current) {
          try {
            const result = await window.graiderUI.migrationExecution!.status({
              selector: tracked.current
            });
            if (active) setState(result);
          } catch {
            if (active) {
              tracked.current = null;
              setState(null);
            }
          }
        }
      } catch {
        /* Account invalidation cannot return another account's transaction. */
      } finally {
        pending = false;
        if (active) setChecking(false);
      }
    };
    void read();
    const timer = setInterval(() => {
      void read();
    }, MIGRATION_STATUS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return checking ? (
    <main className="dashboard-shell">
      <p role="status">Checking migration status…</p>
    </main>
  ) : state ? (
    <main className="dashboard-content">
      <MigrationExecutionPanel
        state={state}
        onState={setState}
        onLeave={() => {
          tracked.current = null;
          setState(null);
        }}
      />
    </main>
  ) : (
    <>{children}</>
  );
};

export const MigrationHistoryReport = ({
  history
}: {
  readonly history: MigrationHistory;
}): ReactElement => (
  <>
    <h2>Migration Report</h2>
    <p>
      Schema 2 is authoritative. This permanent report preserves the original review and
      reconciliation evidence.
    </p>
    <dl className="detail-grid">
      <div>
        <dt>Migration date</dt>
        <dd>
          {history.migrationDate
            ? new Date(history.migrationDate).toLocaleString()
            : "Unavailable in historical evidence"}
        </dd>
      </div>
      <div>
        <dt>Schema 1 recovery checkpoint</dt>
        <dd>{history.checkpoint}</dd>
      </div>
      <div>
        <dt>Publication revision</dt>
        <dd>{history.publication}</dd>
      </div>
      <div>
        <dt>Original reviewer GitHub ID</dt>
        <dd>{history.reviewedIdentity}</dd>
      </div>
      <div>
        <dt>Last recorded reconciliation</dt>
        <dd>{history.reconciliation?.status.replaceAll("_", " ") ?? "Not yet verified"}</dd>
      </div>
    </dl>
    <p>
      The checkpoint preserves original remote Schema 1 evidence. It is not an automatic rollback
      and does not back up machine-local grading records.
    </p>
    <h3>Resolved faculty decisions</h3>
    <p>
      Fallback administrator GitHub ID:{" "}
      {history.reviewedAuthority?.fallbackAdministratorGithubUserId ?? "Unresolved"}. Term creation
      order: {history.reviewedAuthority?.termCreationOrder.join(", ") || "No terms"}.
    </p>
    <ul>
      {history.reviewedRoles.map((term) => (
        <li key={term.termCode}>
          {term.termCode}: {term.status}; coordinators{" "}
          {term.currentCoordinatorGithubUserIds.join(", ")}; activation history{" "}
          {String(term.hasEverBeenActive)}.
        </li>
      ))}
    </ul>
    <ul>
      {history.review.member_decisions.map((decision) => (
        <li key={decision.githubUserId}>
          Legacy member GitHub ID {decision.githubUserId}:{" "}
          {decision.disposition.replaceAll("_", " ")}
          {decision.sections.length
            ? ` — ${decision.sections.map((section) => `${section.termCode} / ${section.sectionId}`).join(", ")}`
            : ""}
          .
        </li>
      ))}
    </ul>
    <h3>Deferred historical findings</h3>
    <p>
      Preserved student identity, grading and comment history findings are informational when
      required operational access is verified. They do not enable later-phase operations.
    </p>
    <ul>
      {history.deferredWork.map((finding) => (
        <li key={finding}>{finding}</li>
      ))}
    </ul>
    <h3>Reconciliation results</h3>
    <ul>
      {history.reconciliation?.steps.map((step) => (
        <li key={step.step}>
          {step.step.replaceAll("_", " ")}: {step.status.replaceAll("_", " ")}
          {step.reasons.length ? ` — ${step.reasons.join(", ")}` : ""}
        </li>
      ))}
    </ul>
    <details>
      <summary>Technical details</summary>
      <pre>{JSON.stringify(history, null, 2)}</pre>
    </details>
  </>
);
