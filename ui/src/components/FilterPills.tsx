import type { ReactElement } from "react";

export interface FilterPill {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface FilterPillsProps {
  readonly pills: readonly FilterPill[];
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
  readonly "aria-label"?: string;
}

export const FilterPills = ({
  pills,
  activeId,
  onSelect,
  "aria-label": ariaLabel = "Filter"
}: FilterPillsProps): ReactElement => (
  <div className="filter-pills" role="group" aria-label={ariaLabel}>
    {pills.map((pill) => {
      const isActive = pill.id === activeId;
      return (
        <button
          key={pill.id}
          type="button"
          className={isActive ? "filter-pill filter-pill--active" : "filter-pill"}
          aria-pressed={isActive}
          onClick={() => {
            onSelect(pill.id);
          }}
        >
          {pill.label} <span className="filter-pill__count">{pill.count}</span>
        </button>
      );
    })}
  </div>
);
