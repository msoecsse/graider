import { MIGRATION_STATUS_POLL_MS } from "../../electron/migrationExecutionTypes";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  MigrationExecutionState,
  MigrationHistory
} from "../../electron/migrationExecutionTypes";
import { MigrationExecutionPanel, MigrationHistoryReport } from "./MigrationExecutionPanel";
export const MigrationHistoryPage = () => {
  const { selector = "" } = useParams<{ selector: string }>();
  const [history, setHistory] = useState<MigrationHistory | null>(null);
  const [state, setState] = useState<MigrationExecutionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const api = window.graiderUI.migrationExecution;
  const load = async () => {
    setBusy(true);
    setHistory(null);
    try {
      setHistory(await api!.history({ selector }));
      setMessage("");
    } catch {
      setMessage(
        "Migration history could not be verified for your current account. Refresh courses and check your fallback administrator or latest-term coordinator access."
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let mounted = true;
    setHistory(null);
    setState(null);
    setBusy(true);
    void api
      ?.history({ selector })
      .then((value) => {
        if (mounted) setHistory(value);
      })
      .catch(() => {
        if (mounted)
          setMessage(
            "Migration history is unavailable for this account or course. Refresh course access before retrying."
          );
      })
      .finally(() => {
        if (mounted) setBusy(false);
      });
    return () => {
      mounted = false;
    };
  }, [api, selector]);
  const retry = async (freshPlan?: true) => {
    if (busy) return;
    setBusy(true);
    try {
      setState(await api!.retry({ selector, ...(freshPlan ? { freshPlan } : {}) }));
      setMessage("");
    } catch {
      setMessage(
        "Recovery requires fresh authorized course state. Refresh the report before retrying."
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!state?.active) return;
    let active = true;
    const timer = setInterval(() => {
      void api
        ?.status({ selector })
        .then((value) => {
          if (active) setState(value);
        })
        .catch(() => {
          if (active) setMessage("Reconnect and refresh authorized course access.");
        });
    }, MIGRATION_STATUS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [state?.active, api, selector]);
  return (
    <main className="dashboard-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <h1>Migration History</h1>
          {!state?.active ? <Link to="/">Back to course overview</Link> : null}
        </div>
      </header>
      <section className="dashboard-content migration-history">
        {busy ? <p role="status">Checking current migration evidence…</p> : null}
        {message ? <p role="alert">{message}</p> : null}
        {state ? <MigrationExecutionPanel state={state} onState={setState} /> : null}
        {history && !state?.active ? (
          <section className="detail-panel">
            <MigrationHistoryReport history={history} />
            <p>
              Historical Ready is not current access proof. Recovery checks current roles,
              repository identity, revision and GitHub access again.
            </p>
            {history.executionState === "fresh_plan_required" ? (
              <>
                <p>
                  The course changed since its previous reconciliation plan. Review this current
                  report before creating a fresh plan. Existing unresolved operations and original
                  history will be preserved.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void retry(true);
                  }}
                >
                  Review current state and retry with a fresh plan
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void retry();
                }}
              >
                Verify and retry reconciliation
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void load();
              }}
            >
              Refresh migration report
            </button>
          </section>
        ) : null}
      </section>
    </main>
  );
};
