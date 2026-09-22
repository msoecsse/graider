import type { ReactElement } from "react";
import { DetailItem } from "./AssignmentDetailPrimitives";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

const displayBoolean = (value: boolean): string => (value ? "Enabled" : "Disabled");

export const StudentReportsPanel = ({
  detail
}: {
  readonly detail: NormalizedAssignmentDetail;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="student-reports-title">
    <h2 id="student-reports-title">Student reports</h2>
    <dl className="detail-grid">
      <DetailItem label="Enabled" value={displayBoolean(detail.studentReports.enabled)} />
      <DetailItem label="Mode" value={detail.studentReports.mode} />
    </dl>
  </section>
);
