import { URL, fileURLToPath } from "node:url";
import { build } from "tsup";

await build({
  entry: {
    assignmentTemplateSyncBackend: fileURLToPath(
      new URL("../../src/template-sync/assignment-template-sync-context.ts", import.meta.url)
    ),
    facultyScopeBackend: fileURLToPath(
      new URL("../../src/faculty/faculty-scope-context.ts", import.meta.url)
    ),
    gradingWorkspaceBackend: fileURLToPath(
      new URL("../../src/grading/grading-workspace-context.ts", import.meta.url)
    ),
    assignmentGradingLifecycleBackend: fileURLToPath(
      new URL("../../src/grading/assignment-grading-lifecycle-context.ts", import.meta.url)
    ),
    gradingStudentSourceBackend: fileURLToPath(
      new URL("../../src/grading/grading-student-source-context.ts", import.meta.url)
    ),
    gradingStudentViewStateBackend: fileURLToPath(
      new URL("../../src/grading/grading-student-view-state-context.ts", import.meta.url)
    ),
    gradingStudentSnapshotBackend: fileURLToPath(
      new URL("../../src/grading/grading-student-snapshot-context.ts", import.meta.url)
    ),
    gradingStudentEvidenceBackend: fileURLToPath(
      new URL("../../src/grading/grading-student-evidence-context.ts", import.meta.url)
    ),
    gradingStudentWorkflowRepairBackend: fileURLToPath(
      new URL("../../src/grading/grading-student-workflow-repair-context.ts", import.meta.url)
    ),
    gradingStudentCommitHistoryBackend: fileURLToPath(
      new URL("../../src/grading/grading-submission-context.ts", import.meta.url)
    ),
    gradingStudentCommentBackend: fileURLToPath(
      new URL("../../src/grading/applied-comment-context.ts", import.meta.url)
    ),
    gradingStudentManualAdjustmentBackend: fileURLToPath(
      new URL("../../src/grading/manual-adjustment-context.ts", import.meta.url)
    ),
    gradingStudentCompleteBackend: fileURLToPath(
      new URL("../../src/grading/grading-student-complete-context.ts", import.meta.url)
    ),
    gradingStudentReportPublicationBackend: fileURLToPath(
      new URL("../../src/grading/grading-student-report-publication-context.ts", import.meta.url)
    ),
    gradingCommentLibraryBackend: fileURLToPath(
      new URL("../../src/grading/grading-comment-library-context.ts", import.meta.url)
    ),
    rosterSectionSummaryBackend: fileURLToPath(
      new URL("../../src/roster/roster-section-summary-context.ts", import.meta.url)
    )
  },
  outDir: fileURLToPath(new URL("../dist-electron", import.meta.url)),
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  target: "node24",
  clean: false,
  dts: false,
  noExternal: ["@octokit/rest", "fast-xml-parser", "yauzl", "yaml", "zod"]
});
