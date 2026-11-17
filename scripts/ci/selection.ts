/** Fail closed: only explicitly understood leaves can use narrow development CI. */
export const REGRESSION_JOBS = [
  "root",
  "ui",
  "gui",
  "apply",
  "grading",
  "safety",
  "signing",
  "migration"
] as const;
export type RegressionJob = (typeof REGRESSION_JOBS)[number];
export interface Change {
  status: string;
  path: string;
}
export interface Selection {
  jobs: Record<RegressionJob, boolean>;
  reasons: string[];
  related: string[];
}

export function fullSelection(reason: string): Selection {
  return {
    jobs: Object.fromEntries(REGRESSION_JOBS.map((job) => [job, true])) as Record<
      RegressionJob,
      boolean
    >,
    reasons: [reason],
    related: []
  };
}

/** --no-renames represents moves as deletion + addition, retaining both names. */
export function parseChanges(output: string): Change[] {
  const fields = output.split("\0");
  if (fields.pop() !== "" || fields.length % 2 !== 0) throw new Error("Incomplete Git change list");
  const changes: Change[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (!status || !/^[AMD]$/.test(status) || !path)
      throw new Error("Unsupported Git change record");
    changes.push({ status, path });
  }
  return changes;
}

/** Renderer importer closure is supplied by the runner; shared/backend changes fail full. */
export function selectChanges(changes: Change[], rendererImporters: string[] = []): Selection {
  if (changes.length === 0) return fullSelection("No reliable changed files");
  const selection: Selection = {
    jobs: Object.fromEntries(REGRESSION_JOBS.map((job) => [job, false])) as Record<
      RegressionJob,
      boolean
    >,
    reasons: [],
    related: []
  };
  for (const change of changes) {
    const file = change.path;
    const docs = /^(docs\/.*\.md|[^/]+\.md)$/.test(file);
    const rendererLeaf =
      /^ui\/src\/(assignment-detail|assignment-edit|assignment-setup|apply-preview|comment-library|course-setup|dashboard|faculty-report|grade-preview|grade-status|grading-workspace|migration-review|review-import|roster-manager)\/[^/]+\.(tsx?|css)$/.test(
        file
      );
    const rootTest =
      /^tests\/(unit|cli|architecture|authorization|recovery|performance)\/.*\.test\.ts$/.test(
        file
      );
    if (docs) selection.reasons.push(`Documentation: ${file}`);
    else if (change.status === "D") return fullSelection(`Deleted or renamed code: ${file}`);
    else if (rendererLeaf || rootTest) {
      selection.related.push(file);
      selection.reasons.push(`Focused tests and importer coverage: ${file}`);
    } else return fullSelection(`Shared, backend, fixture, configuration or unknown path: ${file}`);
  }
  const affected = [...selection.related, ...rendererImporters];
  for (const file of affected) {
    if (
      /migration|schema|course|faculty|config|auth|github|git|reconcil|managed|token|ipc|preload|security/i.test(
        file
      ) ||
      /(?:^|[/_-])terms?(?:[/_.-]|$)/i.test(file)
    ) {
      for (const job of ["migration", "apply", "grading", "safety", "signing"] as const)
        selection.jobs[job] = true;
      selection.reasons.push(`Native migration/authority boundary: ${file}`);
    }
    if (/apply|planning|execution|assignment|groups|recovery|performance|workflows/i.test(file)) {
      selection.jobs.apply = true;
      selection.jobs.safety = true;
      selection.reasons.push(`Apply/IPC boundary: ${file}`);
    }
    if (/grad|report|review-import|comment|dashboard/i.test(file)) {
      for (const job of ["grading", "safety", "signing", "apply"] as const)
        selection.jobs[job] = true;
      selection.reasons.push(`Grading and publication boundary: ${file}`);
    }
    if (/gui|workflows/i.test(file)) selection.jobs.gui = true;
  }
  return selection;
}

export function gateFailures(
  selection: Record<string, string>,
  results: Record<string, { result: string }>
): string[] {
  const failures: string[] = [];
  for (const job of ["select", "fast", ...REGRESSION_JOBS]) {
    const required = job === "select" || job === "fast" || selection[job] === "true";
    const result = results[job]?.result;
    if (
      (required && result !== "success") ||
      (!required && result !== "skipped" && result !== "success")
    )
      failures.push(`${job}: ${result ?? "missing"}`);
    if (
      job !== "select" &&
      job !== "fast" &&
      selection[job] !== "true" &&
      selection[job] !== "false"
    )
      failures.push(`${job}: invalid selection`);
  }
  return failures;
}
