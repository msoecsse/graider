import { MIGRATION_STATUS_POLL_MS } from "../../electron/migrationExecutionTypes";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  MigrationReviewResponse,
  MigrationReviewSessionView,
  MigrationReviewSubmission,
  MigrationReviewResult,
  MigrationReviewTermDecision
} from "../../electron/migrationReviewService";
import {
  emptyMigrationReviewSubmission,
  migrationReviewSource,
  validateMigrationReview
} from "../../../src/migration/migration-review-validation";
import { GraderAccessReviewStep } from "./GraderAccessReview";
import { MigrationExecutionPanel } from "./MigrationExecutionPanel";
import type { MigrationExecutionState } from "../../electron/migrationExecutionTypes";
import { MigrationReviewFaculty } from "./MigrationReviewFaculty";
import { MigrationReviewEvidence } from "./MigrationReviewEvidence";

const STEPS = [
  "Overview",
  "Faculty",
  "Course authority",
  "Terms",
  "Assignments & Apply evidence",
  "Review",
  "Legacy grader access",
  "Final summary"
] as const;
type Step = (typeof STEPS)[number];

export const MigrationReviewPage = ({ selector }: { readonly selector: string }): ReactElement => {
  const [checked, setChecked] = useState(false);
  const [graderReview, setGraderReview] = useState<
    import("../../../src/migration/grader-access-review").GraderAccessReview | null
  >(null);
  const [graderComplete, setGraderComplete] = useState(false);
  const [execution, setExecution] = useState<MigrationExecutionState | null>(null);
  const [saving, setSaving] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveFailed = useRef(false);
  const pendingSaves = useRef(0);
  const starting = useRef(false);
  const [view, setView] = useState<MigrationReviewSessionView | null>(null);
  const latestView = useRef<MigrationReviewSessionView | null>(null);
  const [decisions, setDecisions] = useState<MigrationReviewSubmission | null>(null);
  const [step, setStep] = useState<Step>("Overview");
  const [busy, setBusy] = useState(true);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState<MigrationReviewResult | null>(null);
  const api = window.graiderUI.migrationReview;
  const accept = (response: MigrationReviewResponse) => {
    setMessage(response.message);
    setStale(response.status === "stale");
    if (response.view !== null) {
      latestView.current = response.view;
      setView(response.view);
      setDecisions(response.savedSubmission ?? emptyMigrationReviewSubmission(response.view));
      setGraderComplete(false);
      setCompleted(null);
    }
  };
  useEffect(() => {
    if (!checked) return;
    let active = true;
    latestView.current = null;
    setView(null);
    setDecisions(null);
    setBusy(true);
    setCompleted(null);
    setStale(false);
    if (!api) {
      setMessage("Migration review is unavailable in this app version.");
      setBusy(false);
      return;
    }
    void api
      .load({ selector })
      .then((response) => {
        if (active) accept(response);
      })
      .catch(() => {
        if (active) setMessage("Course review could not be loaded. Refresh courses and try again.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      const closing = latestView.current;
      if (closing)
        void saveQueue.current
          .finally(() =>
            api.close({
              sessionId: closing.sessionId,
              source: migrationReviewSource(closing.analysis)
            })
          )
          .catch(() => {});
    };
  }, [selector, api, checked]);
  const enqueueSave = (work: () => Promise<void>): Promise<void> => {
    setSaving(true);
    pendingSaves.current += 1;
    // Send every decision immediately. Main serializes received saves and drains them on close.
    saveQueue.current = Promise.all([saveQueue.current, work()])
      .then(() => {
        saveFailed.current = false;
      })
      .catch(() => {
        saveFailed.current = true;
        setMessage(
          "Review autosave failed. Keep this page open, refresh course access and retry your selection before leaving."
        );
      })
      .finally(() => {
        pendingSaves.current -= 1;
        if (pendingSaves.current === 0) setSaving(false);
      });
    return saveQueue.current;
  };
  const change = (next: MigrationReviewSubmission) => {
    setDecisions(next);
    setCompleted(null);
    setGraderComplete(false);
    if (api?.save && view)
      void enqueueSave(() =>
        api.save({
          sessionId: view.sessionId,
          source: migrationReviewSource(view.analysis),
          submission: next
        })
      );
  };
  const verify = async (
    institutionalUsername: string,
    githubLogin: string,
    addFaculty: boolean
  ) => {
    if (!api || !view) return;
    setBusy(true);
    try {
      await saveQueue.current;
      accept(
        await api.verify({
          sessionId: view.sessionId,
          source: migrationReviewSource(view.analysis),
          institutionalUsername,
          githubLogin,
          addFaculty
        })
      );
    } catch {
      setMessage("Identity verification failed. Check your GitHub account and try again.");
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (!api) return;
    setBusy(true);
    try {
      await saveQueue.current;
      const response = view
        ? await api.refresh({
            sessionId: view.sessionId,
            source: migrationReviewSource(view.analysis)
          })
        : await api.load({ selector });
      setView(null);
      setDecisions(null);
      setCompleted(null);
      setStep("Overview");
      accept(response);
    } catch {
      setMessage("Analysis could not be refreshed. Reopen review after refreshing courses.");
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    if (!api || !view || !decisions) return;
    setBusy(true);
    try {
      await saveQueue.current;
      if (saveFailed.current) throw new Error("Autosave failed.");
      const result = await api.complete({
        sessionId: view.sessionId,
        source: migrationReviewSource(view.analysis),
        submission: decisions
      });
      setCompleted(result);
      setStale(result.status === "stale");
      setMessage(
        result.status === "complete"
          ? "Migration review complete. No course changes were made. Complete legacy grader access review, then review the final summary."
          : result.status === "stale"
            ? "The authoritative course changed. Refresh analysis and review again."
            : "Review is incomplete or blocked. Check the review findings."
      );
    } catch {
      setMessage(
        "Review could not be completed. Your account, authorization or analysis binding may have changed. Refresh analysis."
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!execution?.active) return;
    let active = true;
    const timer = setInterval(() => {
      void window.graiderUI.migrationExecution
        ?.status({ selector })
        .then((value) => {
          if (active) setExecution(value);
        })
        .catch(() => {
          if (active) setMessage("Reconnect and refresh course access to verify migration status.");
        });
    }, MIGRATION_STATUS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [execution?.active, selector]);
  const start = async () => {
    if (starting.current || !view || !graderComplete || !window.graiderUI.migrationExecution)
      return;
    starting.current = true;
    setBusy(true);
    try {
      await saveQueue.current;
      if (saveFailed.current) throw new Error("Autosave failed.");
      setExecution(
        await window.graiderUI.migrationExecution.start({
          sessionId: view.sessionId,
          source: migrationReviewSource(view.analysis),
          confirmed: true
        })
      );
    } catch {
      setMessage(
        "The account, source or completed reviews changed. Refresh analysis and review before confirming again."
      );
    } finally {
      starting.current = false;
      setBusy(false);
    }
  };
  const proposal = view && decisions ? validateMigrationReview(view, decisions) : null;
  const analysis = view?.analysis;
  const faculty = view?.verifiedFaculty ?? [];
  const updateTerm = (termCode: string, update: Partial<MigrationReviewTermDecision>) => {
    if (decisions)
      change({
        ...decisions,
        terms: decisions.terms.map((term) =>
          term.termCode === termCode ? { ...term, ...update } : term
        )
      });
  };
  const updateOrder = (termCodes: readonly string[]) => {
    if (decisions) change({ ...decisions, creationOrder: { termCodes, confirmed: false } });
  };
  const move = (index: number, offset: number) => {
    const codes = [...(decisions?.creationOrder.termCodes ?? [])];
    const other = index + offset;
    if (other < 0 || other >= codes.length) return;
    const selected = codes[index];
    const displaced = codes[other];
    if (selected !== undefined && displaced !== undefined) {
      codes[index] = displaced;
      codes[other] = selected;
      updateOrder(codes);
    }
  };
  if (!checked)
    return (
      <main className="dashboard-shell">
        <header className="app-header">
          <div className="app-header__inner">
            <h1>Upgrade course</h1>
            <Link to="/">Back to dashboard</Link>
          </div>
        </header>
        <section className="dashboard-content">
          <div className="detail-panel">
            <h2>Migration overview</h2>
            <p>
              Upgrading is optional. Your existing Schema 1 course operations remain available while
              you review or wait for upgrade prerequisites.
            </p>
            <p>
              Schema 2 records verified faculty roles, term lifecycle and section assignment
              evidence. Original course files and deferred student identity, grading and comment
              evidence are preserved; machine-local grading records stay in place.
            </p>
            <p>
              Check course performs read-only analysis. It creates no checkpoint and publishes
              nothing. Review decisions are automatically saved on this computer and checked against
              fresh evidence when you resume.
            </p>
            <p>
              A recovery checkpoint preserves original remote Schema 1 evidence. Publication makes
              Schema 2 authoritative; subsequent access reconciliation can need attention without
              undoing publication.
            </p>
            <p>
              Production migration is disabled until operational support, Phase 3 and compatible
              macOS arm64 and Windows x64 production releases are verified. A completed review or
              Preview app does not enable it.
            </p>
            <button className="primary-action" type="button" onClick={() => setChecked(true)}>
              Check course
            </button>
          </div>
        </section>
      </main>
    );
  if (execution)
    return (
      <main className="dashboard-shell">
        <section className="dashboard-content">
          <MigrationExecutionPanel state={execution} onState={setExecution} />
          {!execution.active && execution.published !== true ? (
            <button
              type="button"
              onClick={() => {
                setExecution(null);
                setChecked(false);
                setGraderComplete(false);
              }}
            >
              Return to migration overview
            </button>
          ) : null}
        </section>
      </main>
    );
  return (
    <main className="dashboard-shell" aria-labelledby="migration-review-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="migration-review-title">Migration Review</h1>
            <p>{analysis?.courseConfigurationEvidence?.value.course.title ?? "Schema v1 course"}</p>
          </div>
          <Link className="secondary-action" to="/">
            Back to dashboard
          </Link>
        </div>
      </header>
      <section className="dashboard-content course-setup" aria-label="Migration review wizard">
        <nav className="course-setup__steps" aria-label="Migration review steps">
          {STEPS.map((item) => (
            <button
              type="button"
              key={item}
              className={
                item === step
                  ? "course-setup__step course-setup__step--active"
                  : "course-setup__step"
              }
              aria-current={item === step ? "step" : undefined}
              onClick={() => setStep(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="course-setup__content">
          <p>
            Review only. This page makes no course, assignment, manifest or GitHub permission
            changes until you explicitly confirm Upgrade course and all backend prerequisites pass.
          </p>
          <button
            className="secondary-action"
            type="button"
            disabled={busy}
            onClick={() => {
              void refresh();
            }}
          >
            Refresh analysis
          </button>
          {saving ? (
            <p role="status">Saving review decisions…</p>
          ) : (
            <p>Review changes are saved automatically on this computer.</p>
          )}
          {busy ? <p role="status">Checking migration review…</p> : null}
          {message ? <p role="status">{message}</p> : null}
          {stale ? (
            <p role="alert">
              The course changed. This review is stale; refresh analysis and review the new
              revision.
            </p>
          ) : null}
          {analysis?.status === "not_applicable" ? (
            <p>This course already uses Schema v2. Migration review is not applicable.</p>
          ) : null}
          {proposal && proposal.errors.length > 0 ? (
            <div className="error-message" role="alert">
              <ul>
                {proposal.errors.map((error, index) => (
                  <li key={`${index}/${error.key}`}>{error.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {view && analysis && decisions && analysis.status !== "not_applicable" ? (
            <fieldset disabled={busy || stale} className="migration-review-fields">
              {step === "Legacy grader access" ? (
                <GraderAccessReviewStep
                  key={view.sessionId}
                  view={view}
                  enabled={completed?.status === "complete"}
                  onCompleted={setGraderComplete}
                  onReview={setGraderReview}
                  onSave={(request) => enqueueSave(() => api!.saveGrader(request))}
                />
              ) : null}
              {step === "Overview" ? (
                <section className="detail-panel">
                  <h2>Overview</h2>
                  <p>
                    {analysis.courseConfigurationEvidence?.value.course.code} · Repository ID{" "}
                    {analysis.source.repositoryId}
                  </p>
                  <p>
                    Analyzed revision:{" "}
                    <abbr title={analysis.source.sourceCommitSha}>
                      {analysis.source.sourceCommitSha.slice(0, 12)}
                    </abbr>{" "}
                    · Analysis: {analysis.status}
                  </p>
                  <p>
                    {analysis.summary.terms} terms · {analysis.summary.assignments} assignments ·{" "}
                    {analysis.summary.faculty} faculty · {analysis.summary.unresolvedFaculty}{" "}
                    unresolved identities · {analysis.summary.blockingIssues} blocking issues
                  </p>
                  <ul>
                    {analysis.issues.map((issue, index) => (
                      <li key={`${index}/${issue.code}`}>
                        {issue.classification}: {issue.message}
                      </li>
                    ))}
                  </ul>
                  <p>
                    Course lifecycle proposal: unarchived — a compatibility migration default, not a
                    historical archive claim. Local hiding and inactivity are ignored.
                  </p>
                  <p>
                    Decisions are saved for this exact source and account outside the course
                    repository. Restored decisions require fresh review completion and final
                    confirmation.
                    <details>
                      <summary>Technical details</summary>
                      <pre>
                        {JSON.stringify(
                          {
                            source: analysis.source,
                            findings: analysis.issues,
                            preservation: analysis.preservation
                          },
                          null,
                          2
                        )}
                      </pre>
                    </details>
                  </p>
                </section>
              ) : null}
              {step === "Final summary" ? (
                <section className="detail-panel" aria-label="Final migration confirmation">
                  <h2>Final migration summary</h2>
                  <p>
                    {analysis.courseConfigurationEvidence?.value.course.code} —{" "}
                    {analysis.courseConfigurationEvidence?.value.course.title}. Repository ID{" "}
                    {analysis.source.repositoryId}. Scope: faculty authority, terms, assignments and
                    preserved evidence.
                  </p>
                  <p>
                    Fallback administrator: {decisions.fallbackAdministratorUsername ?? "Required"}.
                    Term creation order:{" "}
                    {decisions.creationOrder.termCodes.join(", ") || "No terms"}.
                  </p>
                  <ul>
                    {decisions.terms.map((term) => (
                      <li key={term.termCode}>
                        {term.termCode}: {term.status ?? "Required"}; coordinators{" "}
                        {term.currentCoordinatorUsernames.join(", ") || "Required"}; activation
                        history {String(term.hasEverBeenActive)}.
                      </li>
                    ))}
                  </ul>
                  <p>
                    Legacy grader access review:{" "}
                    {graderComplete
                      ? "Complete for the current review"
                      : "Complete this review before confirming"}
                    .
                  </p>
                  <ul>
                    {graderComplete
                      ? graderReview?.decisions.map((decision) => (
                          <li key={decision.githubUserId}>
                            Legacy member GitHub ID {decision.githubUserId}:{" "}
                            {decision.disposition.replaceAll("_", " ")}
                            {decision.sections.length
                              ? ` — ${decision.sections.map((section) => `${section.termCode} / ${section.sectionId}`).join(", ")}`
                              : ""}
                            .
                          </li>
                        ))
                      : null}
                  </ul>
                  <p>
                    Reviewed assignment findings:{" "}
                    {decisions.acknowledgements
                      .map(
                        (item) =>
                          `${item.termCode}/${item.assignmentSlug}: ${item.kind.replaceAll("_", " ")}`
                      )
                      .join("; ") || "No acknowledgements required"}
                    .
                  </p>
                  <h3>Preserved deferred findings</h3>
                  <ul>
                    {analysis.preservation.deferredWork.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p>
                    The immutable recovery checkpoint preserves the exact original remote Schema 1
                    state. It is preserved evidence, not an automatic rollback or a backup of
                    machine-local grading data.
                  </p>
                  <p>
                    Publication makes Schema 2 authoritative. Ready additionally requires verified
                    access reconciliation. Incomplete reconciliation remains Published — Needs
                    attention and is retried separately.
                  </p>
                  <p role="note">
                    <strong>
                      Faculty using incompatible Graider clients will lose access to this course
                      until they update.
                    </strong>{" "}
                    By choosing Upgrade course, you explicitly acknowledge this consequence for this
                    reviewed migration.
                  </p>
                  <p>
                    Production migration remains disabled until trusted operational support, Phase 3
                    signing/distribution/updates, and compatible macOS arm64 and Windows x64
                    production releases are verified. If blocked, update Graider when a compatible
                    production release is available and check the course again. Existing Schema 1
                    operations remain available.
                  </p>
                  <button
                    className="primary-action"
                    type="button"
                    disabled={
                      busy ||
                      saving ||
                      stale ||
                      completed?.status !== "complete" ||
                      !graderComplete ||
                      !window.graiderUI.migrationExecution
                    }
                    onClick={() => {
                      void start();
                    }}
                  >
                    Upgrade course
                  </button>
                </section>
              ) : null}
              {step === "Faculty" ? (
                <MigrationReviewFaculty view={view} busy={busy} onVerify={verify} />
              ) : null}
              {step === "Course authority" ? (
                <section className="detail-panel">
                  <h2>Course authority</h2>
                  <label>
                    Fallback administrator
                    <select
                      value={decisions.fallbackAdministratorUsername ?? ""}
                      onChange={(event) =>
                        change({
                          ...decisions,
                          fallbackAdministratorUsername: event.target.value || null
                        })
                      }
                    >
                      <option value="">Select exactly one faculty identity</option>
                      {faculty.map((entry) => (
                        <option
                          key={entry.identity.institutional_username}
                          value={entry.identity.institutional_username}
                        >
                          {entry.identity.institutional_username} — {entry.identity.github_login}
                          {entry.identity.github_user_id ===
                          analysis.source.authenticatedGithubUserId
                            ? " (signed-in account)"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    Fallback is never selected automatically and does not create section or
                    coordinator authority.
                  </p>
                  <h3>Term creation order</h3>
                  <p>
                    {analysis.termCreationOrder.value !== null
                      ? "Git history supports this candidate. Explicit review is still required."
                      : "Creation order is unproven. Add each term manually, oldest-created first; academic chronology is not authority."}
                  </p>
                  {analysis.terms.length === 0 ? (
                    <p>No terms: the valid creation order is empty.</p>
                  ) : null}
                  <ol aria-label="Reviewed term creation order">
                    {decisions.creationOrder.termCodes.map((code, index) => (
                      <li key={code}>
                        {code}{" "}
                        <button
                          className="secondary-action"
                          type="button"
                          aria-label={`Move ${code} up`}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          Move up
                        </button>{" "}
                        <button
                          className="secondary-action"
                          type="button"
                          aria-label={`Move ${code} down`}
                          disabled={index === decisions.creationOrder.termCodes.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          Move down
                        </button>{" "}
                        <button
                          className="secondary-action"
                          type="button"
                          aria-label={`Remove ${code} from order`}
                          onClick={() =>
                            updateOrder(
                              decisions.creationOrder.termCodes.filter((term) => term !== code)
                            )
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ol>
                  <label>
                    Add term to creation order
                    <select
                      value=""
                      onChange={(event) => {
                        if (event.target.value)
                          updateOrder([...decisions.creationOrder.termCodes, event.target.value]);
                      }}
                    >
                      <option value="">Choose a term to append</option>
                      {analysis.terms
                        .filter((term) => !decisions.creationOrder.termCodes.includes(term.code))
                        .map((term) => (
                          <option key={term.code} value={term.code}>
                            {term.code} — {term.displayName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={decisions.creationOrder.confirmed}
                      onChange={(event) =>
                        change({
                          ...decisions,
                          creationOrder: {
                            ...decisions.creationOrder,
                            confirmed: event.target.checked
                          }
                        })
                      }
                    />
                    I reviewed the complete term creation order
                  </label>
                </section>
              ) : null}
              {step === "Terms" ? (
                <section className="detail-panel">
                  <h2>Terms</h2>
                  {analysis.terms.map((term) => {
                    const selected = decisions.terms.find((item) => item.termCode === term.code);
                    if (!selected) return null;
                    return (
                      <fieldset key={term.code}>
                        <legend>
                          {term.code} — {term.displayName}
                        </legend>
                        <p>
                          Academic year {term.academicYear}, semester {term.semester} · assignments:{" "}
                          {term.assignmentSlugs.join(", ") || "none"}
                        </p>
                        <p>
                          Section faculty candidates for coordinator review:{" "}
                          {term.facultyIdentities.join(", ") || "none"}. No coordinator is
                          automatically selected.
                        </p>
                        {faculty.map((entry) => (
                          <label key={entry.identity.institutional_username}>
                            <input
                              type="checkbox"
                              aria-label={`${term.code} coordinator ${entry.identity.institutional_username}`}
                              checked={selected.currentCoordinatorUsernames.includes(
                                entry.identity.institutional_username
                              )}
                              onChange={(event) =>
                                updateTerm(term.code, {
                                  currentCoordinatorUsernames: event.target.checked
                                    ? [
                                        ...selected.currentCoordinatorUsernames,
                                        entry.identity.institutional_username
                                      ]
                                    : selected.currentCoordinatorUsernames.filter(
                                        (name) => name !== entry.identity.institutional_username
                                      )
                                })
                              }
                            />
                            {entry.identity.institutional_username} — {entry.identity.github_login}
                          </label>
                        ))}
                        <label>
                          {term.code} lifecycle status
                          <select
                            value={selected.status ?? ""}
                            onChange={(event) =>
                              updateTerm(term.code, {
                                status:
                                  event.target.value === "draft" ||
                                  event.target.value === "active" ||
                                  event.target.value === "archived"
                                    ? event.target.value
                                    : null
                              })
                            }
                          >
                            <option value="">Choose status</option>
                            <option value="draft">Draft</option>
                            <option value="active">Active</option>
                            <option value="archived">Archived</option>
                          </select>
                        </label>
                        {term.lifecycle.hasEverBeenActive.value === true ? (
                          <p>
                            Prior student-facing activity proven by authoritative source: yes
                            (locked).
                          </p>
                        ) : (
                          <label>
                            {term.code} has ever been active
                            <select
                              value={
                                selected.hasEverBeenActive === null
                                  ? ""
                                  : String(selected.hasEverBeenActive)
                              }
                              onChange={(event) =>
                                updateTerm(term.code, {
                                  hasEverBeenActive:
                                    event.target.value === "" ? null : event.target.value === "true"
                                })
                              }
                            >
                              <option value="">Choose yes or no</option>
                              <option value="true">Yes</option>
                              <option value="false">No</option>
                            </select>
                          </label>
                        )}
                        <p>
                          Lifecycle evidence: {term.lifecycle.hasEverBeenActive.evidence.join("; ")}
                        </p>
                        <p>
                          Assignment Apply evidence:{" "}
                          {analysis.assignments
                            .filter((assignment) => assignment.termCode === term.code)
                            .map((assignment) => `${assignment.slug}: ${assignment.applyState}`)
                            .join("; ") || "not observed"}
                        </p>
                        <h3>Section faculty: v1 → proposed v2 current</h3>
                        <ul>
                          {term.sections.map((section) => (
                            <li key={section.id}>
                              Section {section.id}:{" "}
                              {section.facultyIdentities
                                .map(
                                  (username) =>
                                    `${username} → ${analysis.faculty.find((item) => item.institutionalUsername === username)?.resolution.value?.github_login ?? "unresolved"}`
                                )
                                .join(", ") || "No section faculty"}
                              . No former faculty inferred.
                            </li>
                          ))}
                        </ul>
                      </fieldset>
                    );
                  })}
                </section>
              ) : null}
              {step === "Assignments & Apply evidence" ? (
                <MigrationReviewEvidence
                  analysis={analysis}
                  acknowledgements={decisions.acknowledgements}
                  onAcknowledgements={(acknowledgements) =>
                    change({ ...decisions, acknowledgements })
                  }
                />
              ) : null}
              {step === "Review" && proposal ? (
                <section className="detail-panel">
                  <h2>Review summary</h2>
                  <p>Proposed course lifecycle: unarchived (compatibility default).</p>
                  <p>Fallback: {decisions.fallbackAdministratorUsername ?? "Selection required"}</p>
                  <p>
                    Reviewed creation order:{" "}
                    {decisions.creationOrder.termCodes.join(" → ") || "empty"} ·{" "}
                    {decisions.creationOrder.confirmed
                      ? "explicitly confirmed"
                      : "confirmation required"}
                  </p>
                  <ul>
                    {proposal.facultyDirectory.map((entry) => (
                      <li key={entry.institutional_username}>
                        {entry.institutional_username} → {entry.github_login} · immutable GitHub ID{" "}
                        {entry.github_user_id}
                      </li>
                    ))}
                  </ul>
                  <ul>
                    {decisions.terms.map((term) => (
                      <li key={term.termCode}>
                        {term.termCode}: {term.status ?? "status required"}, has ever been active:{" "}
                        {term.hasEverBeenActive === null
                          ? "decision required"
                          : String(term.hasEverBeenActive)}
                        , current coordinators:{" "}
                        {term.currentCoordinatorUsernames.join(", ") || "selection required"}
                      </li>
                    ))}
                  </ul>
                  <h3>Human decisions still required</h3>
                  <ul>
                    {proposal.missingDecisions.map((missing, index) => (
                      <li key={`${index}/${missing.key}`}>{missing.message}</li>
                    ))}
                  </ul>
                  <h3>Publication blockers and conversion Needs attention</h3>
                  <ul>
                    {[...proposal.publicationBlockers, ...proposal.conversionNeedsAttention].map(
                      (issue, index) => (
                        <li key={`${index}/${issue}`}>{issue}</li>
                      )
                    )}
                  </ul>
                  <p>
                    Grader debt:{" "}
                    {proposal.graderDebtPresent ? "Present; Phase 9.4" : "Not observed"}.
                    Organization: {proposal.organizationCondition}.
                  </p>
                  <p>Deferred work: {proposal.deferredMigrationWork.join("; ")}.</p>
                  <p>
                    Complete means the review's human decisions are valid. Later publication
                    requires another authoritative revision check.
                  </p>
                  <button
                    className="primary-action"
                    type="button"
                    disabled={
                      busy ||
                      stale ||
                      proposal.status !== "complete" ||
                      completed?.status === "complete"
                    }
                    onClick={() => {
                      void complete();
                    }}
                  >
                    Complete migration review
                  </button>
                </section>
              ) : null}
            </fieldset>
          ) : null}
          {completed ? (
            <section className="detail-panel" aria-label="Migration review result">
              <h2>Review result: {completed.status}</h2>
              <p>
                Bound to repository {completed.source.repositoryId}, revision{" "}
                {completed.source.sourceCommitSha.slice(0, 12)}. Decisions are saved; final
                execution independently revalidates this review and all publication prerequisites.
              </p>
              {completed.errors.map((error, index) => (
                <p key={`${index}/${error.key}`}>{error.message}</p>
              ))}
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
};

export const MigrationReviewRoute = (): ReactElement => {
  const { selector = "" } = useParams<{ selector: string }>();
  return <MigrationReviewPage key={selector} selector={selector} />;
};
