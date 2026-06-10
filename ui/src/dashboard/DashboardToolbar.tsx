import type { ReactElement } from "react";
import type { DashboardSortOption, DashboardViewFilter } from "./dashboardFilters";

interface DashboardToolbarProps {
  readonly searchQuery: string;
  readonly viewFilter: DashboardViewFilter;
  readonly sortOption: DashboardSortOption;
  readonly isRefreshing: boolean;
  readonly isSelectingFolder: boolean;
  readonly hasCourseFolders: boolean;
  readonly visibleCardCount: number;
  readonly totalCardCount: number;
  readonly onSearchQueryChange: (query: string) => void;
  readonly onViewFilterChange: (viewFilter: DashboardViewFilter) => void;
  readonly onSortOptionChange: (sortOption: DashboardSortOption) => void;
  readonly onRefreshDashboard: () => void;
  readonly onOpenCourseFolder: () => void;
}

const getCardCountLabel = (visibleCardCount: number, totalCardCount: number): string => {
  const courseLabel = visibleCardCount === 1 ? "course" : "courses";

  if (visibleCardCount === totalCardCount) {
    return `${visibleCardCount} ${courseLabel}`;
  }

  return `${visibleCardCount} of ${totalCardCount} ${courseLabel} shown`;
};

export const DashboardToolbar = ({
  searchQuery,
  viewFilter,
  sortOption,
  isRefreshing,
  isSelectingFolder,
  hasCourseFolders,
  visibleCardCount,
  totalCardCount,
  onSearchQueryChange,
  onViewFilterChange,
  onSortOptionChange,
  onRefreshDashboard,
  onOpenCourseFolder
}: DashboardToolbarProps): ReactElement => (
  <div className="toolbar" aria-label="Dashboard controls">
    <label className="search-field">
      <span>Search</span>
      <input
        type="search"
        value={searchQuery}
        placeholder="Search for a course or assignment"
        onChange={(event) => {
          onSearchQueryChange(event.currentTarget.value);
        }}
      />
    </label>
    <label className="select-field">
      <span>View</span>
      <select
        value={viewFilter}
        onChange={(event) => {
          onViewFilterChange(event.currentTarget.value as DashboardViewFilter);
        }}
      >
        <option value="active">Active</option>
        <option value="needs-attention">Needs attention</option>
        <option value="all">All</option>
      </select>
    </label>
    <label className="select-field">
      <span>Sort</span>
      <select
        value={sortOption}
        onChange={(event) => {
          onSortOptionChange(event.currentTarget.value as DashboardSortOption);
        }}
      >
        <option value="newest-first">Newest first</option>
        <option value="course">Course</option>
        <option value="term">Term</option>
        <option value="needs-attention">Needs attention</option>
        <option value="recently-refreshed">Recently refreshed</option>
      </select>
    </label>
    <div className="toolbar__count" aria-live="polite">
      {getCardCountLabel(visibleCardCount, totalCardCount)}
    </div>
    <button
      className="secondary-action"
      type="button"
      disabled={!hasCourseFolders || isRefreshing}
      onClick={onRefreshDashboard}
    >
      {isRefreshing ? "Refreshing..." : "Refresh"}
    </button>
    <button
      className="primary-action"
      type="button"
      disabled={isSelectingFolder}
      onClick={onOpenCourseFolder}
    >
      Open course folder
    </button>
  </div>
);
