import { getCardTitle } from "./dashboardAggregation";
import type { CombinedDashboardCard, FolderDashboardError } from "./dashboardTypes";

export const VIEW_FILTERS = ["active", "needs-attention", "all"] as const;
export const SORT_OPTIONS = [
  "newest-first",
  "course",
  "term",
  "needs-attention",
  "recently-refreshed"
] as const;

export type DashboardViewFilter = (typeof VIEW_FILTERS)[number];
export type DashboardSortOption = (typeof SORT_OPTIONS)[number];

const DESCENDING = -1;
const ASCENDING = 1;
const EQUAL = 0;
const FIRST_ITEM_INDEX = 0;

const INACTIVE_STATUSES = new Set(["archived", "inactive"]);

const normalizeQuery = (query: string): string => query.trim().toLocaleLowerCase();

const getSearchFields = (combinedCard: CombinedDashboardCard): readonly string[] => {
  const { card } = combinedCard;
  const assignmentFields = card.recentAssignments.flatMap((assignment) => [
    assignment.slug,
    assignment.title
  ]);

  return [
    card.displayName,
    card.courseSlug,
    card.courseTitle,
    card.termSlug,
    card.termTitle,
    combinedCard.sourceFolderPath,
    ...assignmentFields
  ].filter((value): value is string => value !== null);
};

const cardMatchesSearch = (combinedCard: CombinedDashboardCard, query: string): boolean => {
  const normalizedQuery = normalizeQuery(query);

  if (normalizedQuery.length === 0) {
    return true;
  }

  return getSearchFields(combinedCard).some((field) =>
    field.toLocaleLowerCase().includes(normalizedQuery)
  );
};

const cardNeedsAttention = (combinedCard: CombinedDashboardCard): boolean =>
  combinedCard.card.needsAttention ||
  combinedCard.card.recentAssignments.some((assignment) => assignment.needsAttention);

const cardMatchesView = (
  combinedCard: CombinedDashboardCard,
  viewFilter: DashboardViewFilter
): boolean => {
  if (viewFilter === "all") {
    return true;
  }

  if (viewFilter === "needs-attention") {
    return cardNeedsAttention(combinedCard);
  }

  const status = combinedCard.card.status?.toLocaleLowerCase();

  return status === undefined || !INACTIVE_STATUSES.has(status);
};

const compareText = (left: string | null, right: string | null): number =>
  (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" });

const getCourseSortKey = (combinedCard: CombinedDashboardCard): string | null =>
  combinedCard.card.courseTitle ?? combinedCard.card.courseSlug ?? combinedCard.card.displayName;

const getTermSortKey = (combinedCard: CombinedDashboardCard): string | null =>
  combinedCard.card.termSlug ??
  combinedCard.card.termTitle ??
  combinedCard.card.courseSlug ??
  combinedCard.card.displayName;

const parseTimestamp = (value: string | null): number | null => {
  if (value === null) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
};

const compareTimestampDescending = (left: string | null, right: string | null): number => {
  const leftTimestamp = parseTimestamp(left);
  const rightTimestamp = parseTimestamp(right);

  if (leftTimestamp === null && rightTimestamp === null) {
    return EQUAL;
  }

  if (leftTimestamp === null) {
    return ASCENDING;
  }

  if (rightTimestamp === null) {
    return DESCENDING;
  }

  return rightTimestamp - leftTimestamp;
};

const getMostRecentAssignmentDueAt = (combinedCard: CombinedDashboardCard): string | null => {
  const sortedDueDates = combinedCard.card.recentAssignments
    .map((assignment) => assignment.dueAt)
    .filter((dueAt): dueAt is string => parseTimestamp(dueAt) !== null)
    .sort(compareTimestampDescending);

  return sortedDueDates[FIRST_ITEM_INDEX] ?? null;
};

const compareNewestFirst = (left: CombinedDashboardCard, right: CombinedDashboardCard): number => {
  const dueAtComparison = compareTimestampDescending(
    getMostRecentAssignmentDueAt(left),
    getMostRecentAssignmentDueAt(right)
  );

  if (dueAtComparison !== EQUAL) {
    return dueAtComparison;
  }

  const refreshedComparison = compareTimestampDescending(
    left.sourceLastRefreshedAt,
    right.sourceLastRefreshedAt
  );

  return refreshedComparison === EQUAL
    ? compareText(getCardTitle(left.card), getCardTitle(right.card))
    : refreshedComparison;
};

const compareNeedsAttention = (
  left: CombinedDashboardCard,
  right: CombinedDashboardCard
): number => {
  const leftNeedsAttention = cardNeedsAttention(left);
  const rightNeedsAttention = cardNeedsAttention(right);

  if (leftNeedsAttention !== rightNeedsAttention) {
    return leftNeedsAttention ? DESCENDING : ASCENDING;
  }

  const leftAttentionCount = left.card.attentionCount ?? 0;
  const rightAttentionCount = right.card.attentionCount ?? 0;

  if (leftAttentionCount !== rightAttentionCount) {
    return rightAttentionCount - leftAttentionCount;
  }

  return compareText(getCardTitle(left.card), getCardTitle(right.card));
};

const compareCards = (
  left: CombinedDashboardCard,
  right: CombinedDashboardCard,
  sortOption: DashboardSortOption
): number => {
  if (sortOption === "course") {
    return compareText(getCourseSortKey(left), getCourseSortKey(right));
  }

  if (sortOption === "term") {
    return compareText(getTermSortKey(left), getTermSortKey(right));
  }

  if (sortOption === "needs-attention") {
    return compareNeedsAttention(left, right);
  }

  if (sortOption === "recently-refreshed") {
    const refreshedComparison = compareTimestampDescending(
      left.sourceLastRefreshedAt,
      right.sourceLastRefreshedAt
    );

    return refreshedComparison === EQUAL
      ? compareText(getCardTitle(left.card), getCardTitle(right.card))
      : refreshedComparison;
  }

  return compareNewestFirst(left, right);
};

export const filterAndSortDashboardCards = (
  cards: readonly CombinedDashboardCard[],
  query: string,
  viewFilter: DashboardViewFilter,
  sortOption: DashboardSortOption
): readonly CombinedDashboardCard[] =>
  cards
    .filter((card) => cardMatchesSearch(card, query) && cardMatchesView(card, viewFilter))
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      const comparison = compareCards(left.card, right.card, sortOption);

      return comparison === EQUAL ? left.index - right.index : comparison;
    })
    .map((entry) => entry.card);

export const filterFolderErrors = (
  folderErrors: readonly FolderDashboardError[],
  query: string,
  _viewFilter: DashboardViewFilter
): readonly FolderDashboardError[] => {
  const normalizedQuery = normalizeQuery(query);

  if (normalizedQuery.length === 0) {
    return folderErrors;
  }

  return folderErrors.filter((folderError) =>
    [folderError.sourceFolderPath, folderError.code, folderError.message].some((field) =>
      field.toLocaleLowerCase().includes(normalizedQuery)
    )
  );
};
