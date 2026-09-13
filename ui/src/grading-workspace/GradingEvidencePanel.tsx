import type { ReactElement } from "react";
import type { GradingStudentEvidenceResult } from "../../electron/ipc";

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
      <dl className="grading-evidence__outcomes">
        <div>
          <dt>Compile</dt>
          <dd>{outcomeLabel(evidence.metadata.compile.outcome)}</dd>
        </div>
        <div>
          <dt>Unit Tests</dt>
          <dd>{outcomeLabel(evidence.metadata.junit.outcome)}</dd>
        </div>
        <div>
          <dt>Checkstyle</dt>
          <dd>{outcomeLabel(evidence.metadata.checkstyle.outcome)}</dd>
        </div>
      </dl>
      <div className="grading-evidence__phase">
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
      </div>
      <div className="grading-evidence__phase">
        <h4>Checkstyle findings</h4>
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
      </div>
    </>
  );
};

export const GradingEvidencePanel = ({
  state,
  onReload
}: {
  readonly state: EvidenceLoadState;
  readonly onReload: (studentId: string) => void;
}): ReactElement | null => {
  if (state.status === "idle" || state.status === "not_applicable") return null;
  const studentId = state.status === "success" ? state.result.studentId : state.studentId;
  return (
    <section className="grading-evidence" aria-labelledby="automated-checks-heading">
      <div className="grading-evidence__heading">
        <h3 id="automated-checks-heading">Automated Checks</h3>
        <button
          type="button"
          disabled={state.status === "loading"}
          onClick={() => onReload(studentId)}
        >
          Reload automated checks
        </button>
      </div>
      {state.status === "loading" ? (
        <p aria-live="polite">Loading automated checks for {state.studentId}…</p>
      ) : state.status === "message" ? (
        <p
          className={`grading-evidence__message grading-evidence__message--${state.tone}`}
          role="status"
        >
          {state.message}
        </p>
      ) : (
        <SuccessEvidence result={state.result} />
      )}
    </section>
  );
};
