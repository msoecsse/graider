import {
  formatApplyPreviewRepositoryStatus,
  formatApplyResultRepositoryStatus
} from "./applyPreviewReadiness";
import { formatStatusLabel } from "../components/statusLabels";
import type {
  ApplyGroupRowState,
  ApplyResultGroupTarget,
  ApplyResultRepositoryRow,
  ApplyRowState,
  NormalizedApplyPreview,
  NormalizedApplyResult
} from "./applyPreviewTypes";

const UNMATCHED_ROW_KEY = "row";
const UNMATCHED_GROUP_KEY = "group";

const getRowKey = (row: {
  readonly studentId: string | null;
  readonly githubUsername: string | null;
  readonly repository: string | null;
  readonly section: string | null;
}): string =>
  `${row.studentId ?? row.githubUsername ?? row.repository ?? UNMATCHED_ROW_KEY}-${row.section ?? "section"}`;

const getGroupKey = (target: {
  readonly groupId: string | null;
  readonly repositoryName: string | null;
}): string => target.groupId ?? target.repositoryName ?? UNMATCHED_GROUP_KEY;

/**
 * Joins preview rows with their apply result, by student identity, into one
 * row per student. README section 5.4: "one plan table... updates that
 * table's Status column in place" instead of a second table appended below.
 *
 * Preview rows are the primary list (they define "what's in the plan"); any
 * result row that doesn't match one is appended so a row is never silently
 * dropped, though in practice apply runs against the same target set the
 * preview computed.
 */
export const mergeApplyRows = (
  preview: NormalizedApplyPreview,
  result: NormalizedApplyResult | null
): readonly ApplyRowState[] => {
  const resultByKey = new Map<string, ApplyResultRepositoryRow>();

  if (result !== null) {
    for (const row of result.rows) {
      resultByKey.set(getRowKey(row), row);
    }
  }

  const matchedKeys = new Set<string>();
  const merged: ApplyRowState[] = preview.plan.repositories.map((previewRow) => {
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

/**
 * Group-mode equivalent of `mergeApplyRows`. Preview group targets carry no
 * per-target status (group apply is all-or-nothing before it runs), so
 * `previewStatus` is synthesized once from `preview.applySupported` and
 * applied to every row -- matching how the backend computes the group
 * preview summary (src/apply-preview/apply-preview-builder.ts: every group
 * target is blocked together, or none are).
 */
export const mergeApplyGroupRows = (
  preview: NormalizedApplyPreview,
  result: NormalizedApplyResult | null
): readonly ApplyGroupRowState[] => {
  const previewStatus = preview.applySupported ? "would_create" : "blocked";
  const resultByKey = new Map<string, ApplyResultGroupTarget>();

  if (result !== null) {
    for (const target of result.groupTargets) {
      resultByKey.set(getGroupKey(target), target);
    }
  }

  const matchedKeys = new Set<string>();
  const merged: ApplyGroupRowState[] = preview.plan.groupTargets.map((target) => {
    const key = getGroupKey(target);
    const resultTarget = resultByKey.get(key);

    if (resultTarget !== undefined) {
      matchedKeys.add(key);
    }

    return {
      groupId: target.groupId,
      repositoryName: resultTarget?.repositoryName ?? target.repositoryName,
      sectionIds: target.sectionIds,
      studentIds: target.studentIds,
      githubUsernames: target.githubUsernames,
      plannedStudentPermission: target.plannedStudentPermission,
      facultyTeam: target.facultyTeam,
      facultyTeamPermission: target.facultyTeamPermission,
      graderTeam: target.graderTeam,
      graderTeamPermission: target.graderTeamPermission,
      previewStatus,
      resultStatus: resultTarget?.status ?? null,
      htmlUrl: resultTarget?.htmlUrl ?? null,
      diagnostics: resultTarget?.diagnostics ?? []
    };
  });

  if (result !== null) {
    for (const target of result.groupTargets) {
      if (matchedKeys.has(getGroupKey(target))) {
        continue;
      }

      merged.push({
        groupId: target.groupId,
        repositoryName: target.repositoryName,
        sectionIds: [],
        studentIds: target.studentIds,
        githubUsernames: target.githubUsernames,
        plannedStudentPermission: null,
        facultyTeam: null,
        facultyTeamPermission: null,
        graderTeam: null,
        graderTeamPermission: null,
        previewStatus: "unknown",
        resultStatus: target.status,
        htmlUrl: target.htmlUrl,
        diagnostics: target.diagnostics
      });
    }
  }

  return merged;
};

interface CountPhrase {
  readonly count: number;
  /** e.g. { singular: "is blocked", plural: "are blocked" }; number-agnostic phrases ("will be created") just repeat the same string in both. */
  readonly verbPhrase: { readonly singular: string; readonly plural: string };
  readonly shortLabel: string;
}

const verb = (singular: string, plural: string): CountPhrase["verbPhrase"] => ({
  singular,
  plural
});
const agnosticVerb = (phrase: string): CountPhrase["verbPhrase"] => verb(phrase, phrase);

const SINGULAR_COUNT = 1;

/**
 * README section 2.3's own example: "2 repositories will be created, 1
 * skipped" -- the subject noun and verb appear once, on the first non-zero
 * clause (singular when that clause's count is 1, so "will be created"
 * doesn't need to change but "is blocked" vs. "are blocked" does); later
 * clauses are just a count and a short label. Zero-count phrases are
 * omitted entirely, never printed as "0 blocked."
 */
const buildSummarySentence = (
  subjectNoun: { readonly singular: string; readonly plural: string },
  phrases: readonly CountPhrase[]
): string => {
  const nonZero = phrases.filter((phrase) => phrase.count > 0);

  if (nonZero.length === 0) {
    return `No ${subjectNoun.plural} are in this plan.`;
  }

  const clauses = nonZero.map((phrase, index) => {
    const isSingular = phrase.count === SINGULAR_COUNT;

    return index === 0
      ? `${String(phrase.count)} ${isSingular ? subjectNoun.singular : subjectNoun.plural} ${isSingular ? phrase.verbPhrase.singular : phrase.verbPhrase.plural}`
      : `${String(phrase.count)} ${phrase.shortLabel}`;
  });

  return `${clauses.join(", ")}.`;
};

const REPOSITORY_NOUN = { singular: "repository", plural: "repositories" };
const GROUP_REPOSITORY_NOUN = { singular: "group repository", plural: "group repositories" };

const getPreviewRowSummary = (rows: readonly ApplyRowState[]): string => {
  const counts = { wouldCreate: 0, wouldUpdate: 0, wouldSkip: 0, blocked: 0, unknown: 0 };

  for (const row of rows) {
    if (row.previewStatus === "would_create") counts.wouldCreate += 1;
    else if (row.previewStatus === "would_update") counts.wouldUpdate += 1;
    else if (row.previewStatus === "would_skip") counts.wouldSkip += 1;
    else if (row.previewStatus === "blocked") counts.blocked += 1;
    else counts.unknown += 1;
  }

  return buildSummarySentence(REPOSITORY_NOUN, [
    {
      count: counts.wouldCreate,
      verbPhrase: agnosticVerb("will be created"),
      shortLabel: "created"
    },
    {
      count: counts.wouldUpdate,
      verbPhrase: agnosticVerb("will be updated"),
      shortLabel: "updated"
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
 * A row apply never attempted (it was blocked before apply ran, so it has
 * no result) is still counted here -- as blocked, the only true statement
 * about it -- rather than dropped, so this tally always sums to the number
 * of rows shown per README section 5.4.
 */
const getResultRowSummary = (rows: readonly ApplyRowState[]): string => {
  const counts = { created: 0, updated: 0, skipped: 0, failed: 0, blocked: 0 };

  for (const row of rows) {
    const status = row.resultStatus ?? "blocked";
    counts[status] += 1;
  }

  return buildSummarySentence(REPOSITORY_NOUN, [
    {
      count: counts.created,
      verbPhrase: verb("was created", "were created"),
      shortLabel: "created"
    },
    {
      count: counts.updated,
      verbPhrase: verb("was updated", "were updated"),
      shortLabel: "updated"
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

const getGroupPreviewSummary = (rows: readonly ApplyGroupRowState[]): string => {
  let wouldCreate = 0;
  let blocked = 0;

  for (const row of rows) {
    if (row.previewStatus === "blocked") blocked += 1;
    else wouldCreate += 1;
  }

  return buildSummarySentence(GROUP_REPOSITORY_NOUN, [
    { count: wouldCreate, verbPhrase: agnosticVerb("will be created"), shortLabel: "created" },
    { count: blocked, verbPhrase: verb("is blocked", "are blocked"), shortLabel: "blocked" }
  ]);
};

/**
 * Group result status is its own vocabulary (created/updated/failed/
 * blocked/pending -- see ApplyGroupRowState), not ApplyResultRepositoryStatus,
 * so a row with any other value is counted, not dropped, under "other" --
 * the same never-drop-a-row rule as `getResultRowSummary`.
 */
const getGroupResultSummary = (rows: readonly ApplyGroupRowState[]): string => {
  const counts = { created: 0, updated: 0, pending: 0, failed: 0, blocked: 0, other: 0 };

  for (const row of rows) {
    const status = row.resultStatus;

    if (
      status === "created" ||
      status === "updated" ||
      status === "pending" ||
      status === "failed" ||
      status === "blocked"
    ) {
      counts[status] += 1;
    } else {
      counts.other += 1;
    }
  }

  return buildSummarySentence(GROUP_REPOSITORY_NOUN, [
    {
      count: counts.created,
      verbPhrase: verb("was created", "were created"),
      shortLabel: "created"
    },
    {
      count: counts.updated,
      verbPhrase: verb("was updated", "were updated"),
      shortLabel: "updated"
    },
    { count: counts.pending, verbPhrase: verb("is pending", "are pending"), shortLabel: "pending" },
    { count: counts.failed, verbPhrase: agnosticVerb("failed"), shortLabel: "failed" },
    {
      count: counts.blocked,
      verbPhrase: verb("was blocked", "were blocked"),
      shortLabel: "blocked"
    },
    {
      count: counts.other,
      verbPhrase: verb("has an unrecognized status", "have an unrecognized status"),
      shortLabel: "unrecognized"
    }
  ]);
};

/**
 * The one summary sentence README section 5.4 asks for, in place of the ten
 * counter boxes (five preview, five result) it replaces. Tallies are always
 * computed from the same merged rows the table renders, so the counts agree
 * with the rows shown by construction, not by cross-checking two sources.
 */
export const getApplyPlanSummaryText = (
  preview: NormalizedApplyPreview,
  hasResult: boolean,
  rows: readonly ApplyRowState[],
  groupRows: readonly ApplyGroupRowState[]
): string => {
  if (preview.repositoryMode === "group") {
    return hasResult ? getGroupResultSummary(groupRows) : getGroupPreviewSummary(groupRows);
  }

  return hasResult ? getResultRowSummary(rows) : getPreviewRowSummary(rows);
};

/** Status column text for one merged individual row: result once it exists, else preview. */
export const formatMergedRowStatus = (row: ApplyRowState): string =>
  row.resultStatus === null
    ? formatApplyPreviewRepositoryStatus(row.previewStatus)
    : formatApplyResultRepositoryStatus(row.resultStatus);

/** Whether a merged individual row's status chip should read as needing attention. */
export const mergedRowNeedsAttention = (row: ApplyRowState): boolean =>
  row.resultStatus === null
    ? row.previewStatus === "blocked" || row.previewStatus === "unknown"
    : row.resultStatus === "failed" || row.resultStatus === "blocked";

/** Status column text for one merged group row: result once it exists, else preview. */
export const formatMergedGroupRowStatus = (row: ApplyGroupRowState): string => {
  if (row.resultStatus === null) {
    return formatApplyPreviewRepositoryStatus(row.previewStatus);
  }

  if (
    row.resultStatus === "created" ||
    row.resultStatus === "updated" ||
    row.resultStatus === "skipped" ||
    row.resultStatus === "failed" ||
    row.resultStatus === "blocked"
  ) {
    return formatApplyResultRepositoryStatus(row.resultStatus);
  }

  return formatStatusLabel(row.resultStatus);
};

/** Whether a merged group row's status chip should read as needing attention. */
export const mergedGroupRowNeedsAttention = (row: ApplyGroupRowState): boolean =>
  row.resultStatus === null
    ? row.previewStatus === "blocked"
    : row.resultStatus === "failed" || row.resultStatus === "blocked";
