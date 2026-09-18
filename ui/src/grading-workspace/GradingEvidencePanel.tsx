import { useEffect, useRef, type KeyboardEvent, type ReactElement } from "react";
import type { GradingStudentEvidenceResult } from "../../electron/ipc";
import {
  GradingCommitHistoryContent,
  type CommitHistoryLoadState
} from "./GradingCommitHistoryPanel";

type EvidenceSuccess = Extract<GradingStudentEvidenceResult, { readonly status: "success" }>;

export type EvidenceLoadState =
  | { readonly status: "idle" }
  | { readonly status: "not_applicable" }
  | { readonly status: "loading"; readonly studentId: string }
  | { readonly status: "success"; readonly result: EvidenceSuccess }
  | {
      readonly status: "message";
      readonly studentId: string;
      readonly message: string;
      readonly tone: "neutral" | "warning";
    };

const genericEvidenceWarning =
  "Automated evidence could not be trusted or read. You can continue grading.";

export const evidenceResultToLoadState = (
  result: GradingStudentEvidenceResult,
  studentId: string
): EvidenceLoadState => {
  if (result.status === "not_applicable") return { status: "not_applicable" };
  if (result.status === "success")
    return result.studentId === studentId
      ? { status: "success", result }
      : { status: "message", studentId, message: genericEvidenceWarning, tone: "warning" };
  if (result.status === "submission_changed")
    return {
      status: "message",
      studentId,
      message:
        "The local submission changed after grading state was created. Automated evidence belongs to a different local submission and was not shown.",
      tone: "warning"
    };
  if (result.status === "evidence_error") {
    const messages: Readonly<
      Record<string, { readonly message: string; readonly tone: "neutral" | "warning" }>
    > = {
      workflow_run_not_found: {
        message: "No automated results are available yet.",
        tone: "neutral"
      },
      evidence_artifact_missing: {
        message:
          "Automated results were produced, but the grading evidence artifact is unavailable.",
        tone: "warning"
      },
      evidence_artifact_expired: {
        message: "The grading evidence artifact has expired.",
        tone: "warning"
      },
      actions_forbidden: {
        message:
          "Graider cannot read grading evidence from GitHub Actions. Check the configured GitHub token's Actions read permission.",
        tone: "warning"
      },
      evidence_identity_mismatch: {
        message: "Automated evidence did not match this submission and was not shown.",
        tone: "warning"
      }
    };
    const mapped = messages[result.code];
    return {
      status: "message",
      studentId,
      message: mapped?.message ?? genericEvidenceWarning,
      tone: mapped?.tone ?? "warning"
    };
  }
  if (
    result.status === "repository_not_recorded" ||
    result.status === "repository_unavailable" ||
    result.status === "registry_error" ||
    result.status === "submission_commit_unavailable"
  )
    return {
      status: "message",
      studentId,
      message: "Automated evidence is unavailable for this student.",
      tone: "neutral"
    };
  if (result.status === "github_auth_unavailable")
    return {
      status: "message",
      studentId,
      message:
        "Graider cannot read grading evidence from GitHub Actions. Check the configured GitHub token.",
      tone: "warning"
    };
  return { status: "message", studentId, message: genericEvidenceWarning, tone: "warning" };
};

export interface GradingEvidenceFocusRequest {
  readonly target: "checks" | "history";
  readonly token: number;
}

const FAILURE_SUMMARY_SELECTOR = ".grading-evidence__findings > li > details > summary";

const outcomeLabel = (outcome: "success" | "failure" | "skipped"): string =>
  ({ success: "Passed", failure: "Failed", skipped: "Skipped" })[outcome];

const locationLabel = (
  violation: EvidenceSuccess["evidence"]["checkstyle"]["violations"][number]
): string => {
  const suffix = `${violation.line === undefined ? "" : `:${violation.line}`}${
    violation.column === undefined ? "" : `:${violation.column}`
  }`;
  return violation.fileKind === "repository_relative"
    ? `${violation.file}${suffix}`
    : `Noncanonical location: ${violation.file}${suffix}`;
};

const SuccessEvidence = ({ result }: { readonly result: EvidenceSuccess }): ReactElement => {
  const { evidence } = result;
  const allReportedTestsPassed =
    evidence.metadata.junit.outcome === "success" &&
    evidence.junit.available &&
    evidence.junit.summary.failed === 0 &&
    evidence.junit.summary.errors === 0 &&
    evidence.junit.failures.length === 0;
  return (
    <>
      <p className="grading-evidence__student">Automated checks for {result.studentId}</p>
      <details className="grading-evidence__phase" open>
        <summary>Compile</summary>
        <p>{outcomeLabel(evidence.metadata.compile.outcome)}</p>
      </details>
      <details className="grading-evidence__phase" open>
        <summary>Unit Tests</summary>
        <p>{outcomeLabel(evidence.metadata.junit.outcome)}</p>
        <h4>JUnit summary</h4>
        {evidence.junit.available ? (
          <>
            <dl className="grading-evidence__counts" aria-label="JUnit summary">
              {Object.entries(evidence.junit.summary).map(([name, count]) => (
                <div key={name}>
                  <dt>
                    {name[0]?.toUpperCase()}
                    {name.slice(1)}
                  </dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
            {allReportedTestsPassed ? <p>All reported tests passed.</p> : null}
            {evidence.junit.failures.length === 0 ? null : (
              <ul className="grading-evidence__findings" aria-label="JUnit failures and errors">
                {evidence.junit.failures.map((failure, index) => (
                  <li key={`${failure.className ?? ""}:${failure.name}:${index}`}>
                    <details>
                      <summary>
                        {failure.className === undefined
                          ? failure.name
                          : `${failure.className} · ${failure.name}`}
                      </summary>
                      <p>
                        <strong>{failure.kind === "failure" ? "Failure" : "Error"}</strong>
                      </p>
                      {failure.message === undefined ? null : <p>{failure.message}</p>}
                      {failure.details === undefined ? null : (
                        <pre className="grading-evidence__details">{failure.details}</pre>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p>No JUnit report was available.</p>
        )}
      </details>
      <details className="grading-evidence__phase" open>
        <summary>Checkstyle</summary>
        <p>{outcomeLabel(evidence.metadata.checkstyle.outcome)}</p>
        {evidence.checkstyle.available ? (
          <>
            <p>
              {evidence.checkstyle.violationCount === 0
                ? "No Checkstyle violations reported."
                : `${evidence.checkstyle.violationCount} violations`}
            </p>
            {evidence.checkstyle.violations.length === 0 ? null : (
              <ul className="grading-evidence__findings" aria-label="Checkstyle violations">
                {evidence.checkstyle.violations.map((violation, index) => (
                  <li key={`${violation.file}:${violation.line ?? ""}:${index}`}>
                    <p>
                      <strong>{locationLabel(violation)}</strong>
                    </p>
                    <p>
                      {violation.severity}: {violation.message}
                    </p>
                    {violation.source === undefined ? null : <p>Check: {violation.source}</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p>No Checkstyle report was available.</p>
        )}
      </details>
    </>
  );
};

export const GradingEvidencePanel = ({
  state,
  commitHistory,
  onReload,
  open,
  onOpenChange,
  focusRequest
}: {
  readonly state: EvidenceLoadState;
  readonly commitHistory: CommitHistoryLoadState;
  readonly onReload: (studentId: string) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly focusRequest: GradingEvidenceFocusRequest | undefined;
}): ReactElement | null => {
  const sectionRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const loadingRef = useRef<HTMLParagraphElement>(null);
  const historySummaryRef = useRef<HTMLElement>(null);
  const hasEvidence = state.status !== "idle" && state.status !== "not_applicable";
  const hasHistory = commitHistory.status !== "idle";

  useEffect(() => {
    if (!open || focusRequest === undefined) return;
    sectionRef.current?.scrollIntoView?.({ block: "nearest" });
    if (focusRequest.target === "history") {
      historySummaryRef.current?.focus();
      return;
    }
    if (state.status === "loading") {
      loadingRef.current?.focus();
      return;
    }
    summaryRef.current?.focus();
  }, [open, focusRequest]);

  if (!hasEvidence && !hasHistory) return null;
  const studentId =
    state.status === "success"
      ? state.result.studentId
      : "studentId" in state
        ? state.studentId
        : "";

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "r") {
      if (!hasEvidence || state.status === "loading") return;
      event.preventDefault();
      onReload(studentId);
      return;
    }
    if (key === "n") {
      const container = sectionRef.current;
      if (container === null) return;
      const summaries = Array.from(
        container.querySelectorAll<HTMLElement>(FAILURE_SUMMARY_SELECTOR)
      );
      if (summaries.length === 0) return;
      event.preventDefault();
      const currentIndex = summaries.indexOf(document.activeElement as HTMLElement);
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex =
        currentIndex === -1
          ? direction === 1
            ? 0
            : summaries.length - 1
          : (currentIndex + direction + summaries.length) % summaries.length;
      summaries[nextIndex]?.focus();
    }
  };

  return (
    <section
      className="grading-evidence"
      aria-label="Automated Checks"
      ref={sectionRef}
      onKeyDown={handlePanelKeyDown}
    >
      <details open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)}>
        <summary ref={summaryRef}>
          <h3>Automated Checks</h3>
        </summary>
        {hasEvidence ? (
          <div className="grading-evidence__heading">
            <button
              type="button"
              disabled={state.status === "loading"}
              onClick={() => onReload(studentId)}
            >
              Reload automated checks
            </button>
          </div>
        ) : null}
        {state.status === "loading" ? (
          <p aria-live="polite" tabIndex={-1} ref={loadingRef}>
            Loading automated checks for {state.studentId}…
          </p>
        ) : state.status === "message" ? (
          <p
            className={`grading-evidence__message grading-evidence__message--${state.tone}`}
            role="status"
          >
            {state.message}
          </p>
        ) : state.status === "success" ? (
          <SuccessEvidence result={state.result} />
        ) : null}
        {hasHistory ? (
          <details className="grading-evidence__phase" open>
            <summary ref={historySummaryRef}>Commit History</summary>
            <GradingCommitHistoryContent state={commitHistory} />
          </details>
        ) : null}
      </details>
    </section>
  );
};
