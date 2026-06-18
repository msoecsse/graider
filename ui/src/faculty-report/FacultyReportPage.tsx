import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  formatNullableValue,
  formatStatusLabel,
  getDiagnosticCategory,
  groupDiagnostics
} from "../assignment-detail/assignmentDetailReadiness";
import type { AssignmentDetailDiagnostic } from "../assignment-detail/assignmentDetailTypes";
import { normalizeFacultyReport } from "./facultyReportNormalization";
import type {
  FacultyReportLoadResult,
  FacultyReportPageProps,
  FacultyReportStudentRow,
  NormalizedFacultyReport
} from "./facultyReportTypes";

const getCommandErrorMessage = (result: FacultyReportLoadResult | null): string | null => {
  const errorCode = result?.error?.code;

  if (errorCode === undefined) {
    return null;
  }

  if (errorCode === "graider_cli_not_found") {
    return "Graider CLI not found. Install Graider or make sure graider is available on PATH.";
  }

  if (errorCode === "github_cli_not_found") {
    return "GitHub CLI was not found. Install GitHub CLI or set GRAIDER_GITHUB_TOKEN before launching Graider.";
  }

  if (errorCode === "github_cli_auth_failed" || errorCode === "github_token_unavailable") {
    return "GitHub authentication is required. Run gh auth login in Terminal, then refresh.";
  }

  if (errorCode === "bundled_graider_cli_not_found") {
    return "Bundled Graider CLI could not be started. Rebuild or reinstall the Graider app.";
  }

  if (errorCode === "invalid_faculty_report_json") {
    return "Graider returned invalid faculty report JSON.";
  }

  if (errorCode === "assignment_file_not_found") {
    return "Assignment file not found.";
  }

  return "Unable to load faculty report.";
};

const getTitle = (
  report: NormalizedFacultyReport | null,
  fallbackTitle: string | null,
  fallbackSlug: string | null
): string =>
  report?.assignment.assignmentTitle ?? fallbackTitle ?? fallbackSlug ?? "Faculty Report";

const getSubtitle = (report: NormalizedFacultyReport | null): string => {
  const course = report?.assignment.courseCode;
  const term = report?.assignment.termCode;

  if (course !== null && course !== undefined && term !== null && term !== undefined) {
    return `${course} · ${term}`;
  }

  return course ?? term ?? "Course assignment";
};

const formatScore = (score: number | null, maxScore: number | null): string => {
  if (score === null && maxScore === null) {
    return "Not reported";
  }

  if (maxScore === null) {
    return formatNullableValue(score);
  }

  return `${formatNullableValue(score)} / ${maxScore}`;
};

const DetailItem = ({
  label,
  value
}: {
  readonly label: string;
  readonly value: string | number | null | undefined;
}): ReactElement => (
  <div className="detail-item">
    <dt>{label}</dt>
    <dd>
      <span>{formatNullableValue(value)}</span>
    </dd>
  </div>
);

const ContextPanel = ({ report }: { readonly report: NormalizedFacultyReport }): ReactElement => (
  <section className="detail-panel" aria-labelledby="faculty-report-context">
    <h2 id="faculty-report-context">Context</h2>
    <dl className="detail-grid">
      <DetailItem
        label="Assignment"
        value={report.assignment.assignmentTitle ?? report.assignment.assignmentSlug}
      />
      <DetailItem label="Course" value={report.assignment.courseCode} />
      <DetailItem label="Term" value={report.assignment.termCode} />
      <DetailItem label="Assignment file" value={report.assignment.assignmentFile} />
      <DetailItem label="Command status" value={report.status} />
      <DetailItem label="Exit code" value={report.exitCode} />
    </dl>
  </section>
);

const SummaryPanel = ({ report }: { readonly report: NormalizedFacultyReport }): ReactElement => (
  <section className="detail-panel apply-preview-summary" aria-labelledby="faculty-report-summary">
    <h2 id="faculty-report-summary">Report summary</h2>
    <dl className="apply-preview-counts">
      <div>
        <dt>Students</dt>
        <dd>{formatNullableValue(report.summary.studentCount)}</dd>
      </div>
      <div>
        <dt>Active</dt>
        <dd>{formatNullableValue(report.summary.activeStudentCount)}</dd>
      </div>
      <div>
        <dt>Passed</dt>
        <dd>{formatNullableValue(report.summary.passedCount)}</dd>
      </div>
      <div>
        <dt>Failed</dt>
        <dd>{formatNullableValue(report.summary.failedCount)}</dd>
      </div>
      <div>
        <dt>Errors</dt>
        <dd>{formatNullableValue(report.summary.errorCount)}</dd>
      </div>
      <div>
        <dt>Skipped</dt>
        <dd>{formatNullableValue(report.summary.skippedCount)}</dd>
      </div>
      <div>
        <dt>Not configured</dt>
        <dd>{formatNullableValue(report.summary.notConfiguredCount)}</dd>
      </div>
      <div>
        <dt>Missing artifacts</dt>
        <dd>{formatNullableValue(report.summary.missingArtifactCount)}</dd>
      </div>
      <div>
        <dt>Invalid result files</dt>
        <dd>{formatNullableValue(report.summary.invalidResultFileCount)}</dd>
      </div>
      <div>
        <dt>Warnings</dt>
        <dd>{formatNullableValue(report.summary.warningCount)}</dd>
      </div>
      <div>
        <dt>Total errors</dt>
        <dd>{formatNullableValue(report.summary.errorCountTotal)}</dd>
      </div>
      <div>
        <dt>Report files</dt>
        <dd>{formatNullableValue(report.summary.reportFileCount)}</dd>
      </div>
    </dl>
  </section>
);

const MissingDataPanel = ({
  report
}: {
  readonly report: NormalizedFacultyReport;
}): ReactElement =>
  report.hasMissingData ? (
    <section className="detail-guidance" aria-label="Missing report data guidance">
      <h2>Report data is not available for all students yet.</h2>
      <p>Return to Grade Status to check whether grading runs have completed.</p>
    </section>
  ) : (
    <section className="detail-guidance" aria-label="Report data available">
      <h2>Faculty report data is available.</h2>
      <p>Review the summary and generated report paths below.</p>
    </section>
  );

const GeneratedFilesPanel = ({
  generatedFiles
}: {
  readonly generatedFiles: readonly string[];
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="faculty-report-files">
    <h2 id="faculty-report-files">Generated report files</h2>
    {generatedFiles.length === 0 ? (
      <p className="detail-panel__note">No generated report files were returned.</p>
    ) : (
      <ul className="assignment-detail-diagnostics">
        {generatedFiles.map((generatedFile) => (
          <li key={generatedFile}>
            <code>{generatedFile}</code>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const StudentRowsPanel = ({
  students
}: {
  readonly students: readonly FacultyReportStudentRow[];
}): ReactElement => (
  <section
    className="detail-panel apply-preview-repositories"
    aria-labelledby="faculty-report-rows"
  >
    <h2 id="faculty-report-rows">Per-student report rows</h2>
    {students.length === 0 ? (
      <p className="detail-panel__note">No per-student rows were included in command JSON.</p>
    ) : (
      <div className="apply-preview-table" role="table" aria-label="Faculty report student rows">
        <div className="apply-preview-table__header" role="row">
          <span role="columnheader">Student</span>
          <span role="columnheader">Section</span>
          <span role="columnheader">Repository</span>
          <span role="columnheader">Result</span>
          <span role="columnheader">Score</span>
          <span role="columnheader">Checks</span>
        </div>
        {students.map((student) => (
          <div
            className="apply-preview-table__row"
            role="row"
            key={`${student.studentId ?? student.githubUsername ?? "student"}-${student.section ?? "section"}`}
          >
            <span role="cell">{student.githubUsername ?? student.studentId ?? "Unknown"}</span>
            <span role="cell">{formatNullableValue(student.section)}</span>
            <span role="cell" className="apply-preview-table__repository">
              {formatNullableValue(student.repository)}
              <span className="muted-inline"> {formatNullableValue(student.repositoryStatus)}</span>
            </span>
            <span role="cell">
              <span
                className={
                  student.diagnostics.length > 0
                    ? "status-chip status-chip--attention"
                    : "status-chip"
                }
              >
                {formatNullableValue(student.resultStatus)}
              </span>
              <span className="muted-inline">
                {" "}
                Workflow {formatNullableValue(student.workflowStatus)}
              </span>
              <span className="muted-inline">
                {" "}
                Artifact {formatNullableValue(student.artifactStatus)}
              </span>
              <span className="muted-inline">
                {" "}
                Result file {formatNullableValue(student.resultFileStatus)}
              </span>
            </span>
            <span role="cell">{formatScore(student.score, student.maxScore)}</span>
            <span role="cell">{student.checkCount}</span>
          </div>
        ))}
      </div>
    )}
  </section>
);

const DiagnosticEntry = ({
  diagnostic
}: {
  readonly diagnostic: AssignmentDetailDiagnostic;
}): ReactElement => (
  <li>
    <strong>{formatStatusLabel(diagnostic.severity)}</strong>
    <span className="diagnostic-category">{getDiagnosticCategory(diagnostic)}</span>
    <span>{diagnostic.message}</span>
    {diagnostic.code === null ? null : <code>{diagnostic.code}</code>}
  </li>
);

const DiagnosticsPanel = ({
  diagnostics
}: {
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="faculty-report-diagnostics">
    <h2 id="faculty-report-diagnostics">Diagnostics</h2>
    {diagnostics.length === 0 ? (
      <p className="detail-panel__note">No diagnostics.</p>
    ) : (
      <div className="diagnostic-groups">
        {groupDiagnostics(diagnostics).map((group) => (
          <section className="diagnostic-group" aria-label={group.label} key={group.key}>
            <h3>{group.label}</h3>
            <ul className="assignment-detail-diagnostics">
              {group.diagnostics.map((diagnostic, index) => (
                <DiagnosticEntry
                  diagnostic={diagnostic}
                  key={`${diagnostic.code ?? "diagnostic"}-${index}`}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    )}
  </section>
);

export const FacultyReportPage = ({
  selection,
  assignmentDetail,
  gradeStatus,
  onBackToGradeStatus,
  onBackToAssignmentDetail
}: FacultyReportPageProps): ReactElement => {
  const [loadResult, setLoadResult] = useState<FacultyReportLoadResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const normalizedReport = useMemo(
    () =>
      loadResult?.report === null || loadResult?.report === undefined
        ? null
        : normalizeFacultyReport(loadResult.report, selection, loadResult.refreshedAt),
    [loadResult, selection]
  );
  const commandErrorMessage = getCommandErrorMessage(loadResult);
  const title = getTitle(
    normalizedReport,
    assignmentDetail?.assignment.title ?? selection.assignmentTitle,
    assignmentDetail?.assignment.slug ?? selection.assignmentSlug
  );
  const subtitle =
    normalizedReport === null
      ? (selection.courseTitle ?? selection.courseSlug ?? "Course assignment")
      : getSubtitle(normalizedReport);

  const loadReport = async (): Promise<void> => {
    if (loadResult === null) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      setLoadResult(
        await window.graiderUI.getFacultyReport({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          assignmentFile: selection.assignmentFile
        })
      );
    } catch {
      setLoadResult((currentResult) => ({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        status: "failure",
        report: currentResult?.report ?? null,
        error: {
          code: "faculty_report_failed",
          message: "Unable to load faculty report.",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        },
        refreshedAt: currentResult?.refreshedAt ?? null
      }));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, [selection.assignmentFile, selection.courseFolderId, selection.courseFolderPath]);

  return (
    <main className="dashboard-shell" aria-labelledby="faculty-report-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="faculty-report-title">Faculty Report</h1>
            <p className="assignment-detail__subtitle">{title}</p>
            <p className="assignment-detail__subtitle">{subtitle}</p>
          </div>
          <div className="assignment-detail__header-actions">
            <button className="secondary-action" type="button" onClick={onBackToGradeStatus}>
              Back to grading status
            </button>
            <button className="secondary-action" type="button" onClick={onBackToAssignmentDetail}>
              Back to assignment detail
            </button>
            <button
              className="primary-action"
              type="button"
              disabled={isLoading || isRefreshing}
              onClick={() => {
                void loadReport();
              }}
            >
              {isLoading || isRefreshing ? "Refreshing report..." : "Refresh report"}
            </button>
          </div>
        </div>
      </header>

      <section className="dashboard-content assignment-detail" aria-label="Faculty report">
        <p className="preview-only-notice">
          Faculty report view — student report publishing is not enabled here.
        </p>
        <p className="assignment-detail__path">
          Assignment file: {normalizedReport?.assignment.assignmentFile ?? selection.assignmentFile}
        </p>
        {normalizedReport?.refreshedAt === null ||
        normalizedReport?.refreshedAt === undefined ? null : (
          <p className="assignment-detail__path">Last refreshed: {normalizedReport.refreshedAt}</p>
        )}
        {gradeStatus?.summary.readyForReport === false ? (
          <p className="loading-state">
            Some grading runs are not complete. The report command can still run, but it may show
            missing results.
          </p>
        ) : null}
        {isLoading ? <p className="loading-state">Loading faculty report...</p> : null}
        {isRefreshing ? (
          <p className="loading-state">Refreshing report while keeping the current summary.</p>
        ) : null}

        {commandErrorMessage === null ? null : (
          <p className="error-message" role="alert">
            {commandErrorMessage}
          </p>
        )}

        {normalizedReport === null ? (
          <section className="dashboard-placeholder" aria-label="Faculty report loading">
            <h2>Loading faculty report.</h2>
            <p>Graider is running the report command for this assignment.</p>
          </section>
        ) : (
          <div className="assignment-detail-grid apply-preview-grid">
            <ContextPanel report={normalizedReport} />
            <SummaryPanel report={normalizedReport} />
            <MissingDataPanel report={normalizedReport} />
            <GeneratedFilesPanel generatedFiles={normalizedReport.generatedFiles} />
            <StudentRowsPanel students={normalizedReport.students} />
            <DiagnosticsPanel diagnostics={normalizedReport.diagnostics} />
            <section className="detail-panel apply-preview-final-action">
              <h2>Student publishing</h2>
              <p>Student report publishing is handled in a later slice.</p>
              <button className="primary-action" type="button" disabled>
                Publish student reports — deferred
              </button>
              <button className="secondary-action" type="button" disabled>
                Export report — deferred
              </button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
};
