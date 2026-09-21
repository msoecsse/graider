import {
  formatGradeDispatchResultStatus,
  formatGradePreviewRepositoryStatus
} from "./gradePreviewReadiness";
import type {
  GradeDispatchResultRepositoryRow,
  GradeRowState,
  NormalizedGradeDispatchResult,
  NormalizedGradePreview
} from "./gradePreviewTypes";

const UNMATCHED_ROW_KEY = "row";

const getRowKey = (row: {
  readonly studentId: string | null;
  readonly githubUsername: string | null;
  readonly repository: string | null;
  readonly section: string | null;
}): string =>
  `${row.studentId ?? row.githubUsername ?? row.repository ?? UNMATCHED_ROW_KEY}-${row.section ?? "section"}`;

/**
 * Joins preview rows with their dispatch result, by student identity, into
 * one row per student. Mirrors apply-preview/applyPreviewMerge.ts's
 * `mergeApplyRows` (PR9-1); there is no group-mode counterpart to write here
 * -- see the PR9-2 summary for why grade dispatch never empties this array
 * the way apply preview's group mode does.
 *
 * Preview rows are the primary list; any result row that doesn't match one
 * is appended so a row is never silently dropped, though in practice
 * dispatch runs against the same target set the preview computed.
 */
export const mergeGradeRows = (
  preview: NormalizedGradePreview,
  result: NormalizedGradeDispatchResult | null
): readonly GradeRowState[] => {
  const resultByKey = new Map<string, GradeDispatchResultRepositoryRow>();

  if (result !== null) {
    for (const row of result.rows) {
      resultByKey.set(getRowKey(row), row);
    }
  }

  const matchedKeys = new Set<string>();
  const merged: GradeRowState[] = preview.plan.repositories.map((previewRow) => {
    const key = getRowKey(previewRow);
    const resultRow = resultByKey.get(key);

    if (resultRow !== undefined) {
      matchedKeys.add(key);
    }

    return {
      studentId: previewRow.studentId,
      githubUsername: previewRow.githubUsername,
      section: previewRow.section,
      repository: resultRow?.repository ?? previewRow.repository,
      workflow: resultRow?.workflow ?? previewRow.workflow,
      ref: resultRow?.ref ?? previewRow.ref,
      previewStatus: previewRow.status,
      previewReason: previewRow.reason,
      resultStatus: resultRow?.status ?? null,
      resultReason: resultRow?.reason ?? null,
      diagnostics: resultRow?.diagnostics ?? previewRow.diagnostics
    };
  });

  if (result !== null) {
    for (const row of result.rows) {
      if (matchedKeys.has(getRowKey(row))) {
        continue;
      }

      merged.push({
        studentId: row.studentId,
        githubUsername: row.githubUsername,
        section: row.section,
        repository: row.repository,
        workflow: row.workflow,
        ref: row.ref,
        previewStatus: "unknown",
        previewReason: null,
        resultStatus: row.status,
        resultReason: row.reason,
        diagnostics: row.diagnostics
      });
    }
  }

  return merged;
};

interface CountPhrase {
  readonly count: number;
  readonly verbPhrase: { readonly singular: string; readonly plural: string };
  readonly shortLabel: string;
}

const verb = (singular: string, plural: string): CountPhrase["verbPhrase"] => ({
  singular,
  plural
});
const agnosticVerb = (phrase: string): CountPhrase["verbPhrase"] => verb(phrase, phrase);

const SINGULAR_COUNT = 1;
const REPOSITORY_NOUN = { singular: "repository", plural: "repositories" };

/**
 * README section 2.3's own example: "2 repositories will be created, 1
 * skipped" -- the subject noun and verb appear once, on the first non-zero
 * clause (singular when that clause's count is 1); later clauses are just a
 * count and a short label. Zero-count phrases are omitted entirely, never
 * printed as "0 blocked." Identical to applyPreviewMerge.ts's
 * `buildSummarySentence` (PR9-1) -- kept local rather than shared across the
 * two apply/grade modules, since sharing it would mean either module
 * importing from the other's directory for one small helper.
 */
const buildSummarySentence = (phrases: readonly CountPhrase[]): string => {
  const nonZero = phrases.filter((phrase) => phrase.count > 0);

  if (nonZero.length === 0) {
    return `No ${REPOSITORY_NOUN.plural} are in this plan.`;
  }

  const clauses = nonZero.map((phrase, index) => {
    const isSingular = phrase.count === SINGULAR_COUNT;

    return index === 0
      ? `${String(phrase.count)} ${isSingular ? REPOSITORY_NOUN.singular : REPOSITORY_NOUN.plural} ${isSingular ? phrase.verbPhrase.singular : phrase.verbPhrase.plural}`
      : `${String(phrase.count)} ${phrase.shortLabel}`;
  });

  return `${clauses.join(", ")}.`;
};

const getPreviewRowSummary = (rows: readonly GradeRowState[]): string => {
  const counts = { wouldDispatch: 0, wouldSkip: 0, blocked: 0, unknown: 0 };

  for (const row of rows) {
    if (row.previewStatus === "would_dispatch") counts.wouldDispatch += 1;
    else if (row.previewStatus === "would_skip") counts.wouldSkip += 1;
    else if (row.previewStatus === "blocked") counts.blocked += 1;
    else counts.unknown += 1;
  }

  return buildSummarySentence([
    {
      count: counts.wouldDispatch,
      verbPhrase: agnosticVerb("will be dispatched"),
      shortLabel: "dispatched"
    },
    { count: counts.wouldSkip, verbPhrase: agnosticVerb("will be skipped"), shortLabel: "skipped" },
    { count: counts.blocked, verbPhrase: verb("is blocked", "are blocked"), shortLabel: "blocked" },
    {
      count: counts.unknown,
      verbPhrase: verb("has unknown status", "have unknown status"),
      shortLabel: "unknown"
    }
  ]);
};

/**
 * A row dispatch never attempted (it was blocked before dispatch ran, so it
 * has no result) is still counted here -- as blocked, the only true
 * statement about it -- rather than dropped, so this tally always sums to
 * the number of rows shown per README section 5.4.
 */
const getResultRowSummary = (rows: readonly GradeRowState[]): string => {
  const counts = { dispatched: 0, skipped: 0, failed: 0, blocked: 0 };

  for (const row of rows) {
    const status = row.resultStatus ?? "blocked";
    counts[status] += 1;
  }

  return buildSummarySentence([
    {
      count: counts.dispatched,
      verbPhrase: verb("was dispatched", "were dispatched"),
      shortLabel: "dispatched"
    },
    {
      count: counts.skipped,
      verbPhrase: verb("was skipped", "were skipped"),
      shortLabel: "skipped"
    },
    { count: counts.failed, verbPhrase: agnosticVerb("failed"), shortLabel: "failed" },
    {
      count: counts.blocked,
      verbPhrase: verb("was blocked", "were blocked"),
      shortLabel: "blocked"
    }
  ]);
};

/**
 * The one summary sentence README section 5.4 asks for, in place of the two
 * separate counter-box panels it replaces. Tallied directly from the same
 * merged rows the table renders, so the counts agree with the rows shown by
 * construction.
 */
export const getGradePlanSummaryText = (
  hasResult: boolean,
  rows: readonly GradeRowState[]
): string => (hasResult ? getResultRowSummary(rows) : getPreviewRowSummary(rows));

/** Status column text for one merged row: result once it exists, else preview. */
export const formatMergedGradeRowStatus = (row: GradeRowState): string =>
  row.resultStatus === null
    ? formatGradePreviewRepositoryStatus(row.previewStatus)
    : formatGradeDispatchResultStatus(row.resultStatus);

/** Whether a merged row's status chip should read as needing attention. */
export const mergedGradeRowNeedsAttention = (row: GradeRowState): boolean =>
  row.resultStatus === null
    ? row.previewStatus === "blocked" ||
      row.previewStatus === "unknown" ||
      row.previewStatus === "token_required"
    : row.resultStatus === "failed" || row.resultStatus === "blocked";
