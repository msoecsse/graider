import type { ReactElement } from "react";
import type { RosterSectionSummary } from "../../electron/ipc";

const getSummaryText = (summary: RosterSectionSummary | undefined): string => {
  if (summary === undefined) return "Loading";
  if (summary.status === "ready") return String(summary.studentCount);
  if (summary.status === "missing") return "No roster";
  return "Needs attention";
};

export const RosterSectionTabs = ({
  sections,
  summaries,
  selectedSectionId,
  onSelect,
  onAddSection
}: {
  readonly sections: readonly string[];
  readonly summaries: ReadonlyMap<string, RosterSectionSummary>;
  readonly selectedSectionId: string;
  readonly onSelect: (sectionId: string) => void;
  readonly onAddSection: () => void;
}): ReactElement => (
  <div className="roster-section-navigation">
    <div className="roster-section-tabs" role="tablist" aria-label="Course sections">
      {sections.map((sectionId) => {
        const summaryText = getSummaryText(summaries.get(sectionId));
        const selected = sectionId === selectedSectionId;
        return (
          <button
            aria-label={`Section ${sectionId}, ${summaryText}`}
            aria-selected={selected}
            className={selected ? "filter-pill filter-pill--active" : "filter-pill"}
            key={sectionId}
            onClick={() => onSelect(sectionId)}
            role="tab"
            type="button"
          >
            <span>{sectionId}</span>
            <span aria-hidden="true"> · </span>
            <span className="filter-pill__count">{summaryText}</span>
          </button>
        );
      })}
    </div>
    <button className="secondary-action" onClick={onAddSection} type="button">
      Add section
    </button>
  </div>
);
