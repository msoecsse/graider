import type { ReactElement } from "react";
import { DetailItem } from "./AssignmentDetailPrimitives";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

export const RosterPanel = ({
  detail
}: {
  readonly detail: NormalizedAssignmentDetail;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="roster-title">
    <h2 id="roster-title">Roster</h2>
    <dl className="detail-grid">
      {detail.roster === null ? (
        <DetailItem label="Roster" value="Roster summary unavailable." />
      ) : (
        <>
          <DetailItem label="Section count" value={detail.roster.sectionCount} />
          <DetailItem label="Active students" value={detail.roster.activeStudentCount} />
          <DetailItem label="Total students" value={detail.roster.totalStudentCount} />
        </>
      )}
    </dl>
  </section>
);
