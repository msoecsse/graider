import type { ReactElement } from "react";
import { DetailItem, StatusItem } from "./AssignmentDetailPrimitives";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

const displayBoolean = (value: boolean): string => (value ? "Enabled" : "Disabled");

export const GradingPanel = ({
  detail
}: {
  readonly detail: NormalizedAssignmentDetail;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="grading-readiness-title">
    <h2 id="grading-readiness-title">Grading</h2>
    {!detail.grading.enabled ? (
      <p className="detail-panel__note">No grading configured.</p>
    ) : (
      <dl className="detail-grid">
        <DetailItem label="Enabled" value={displayBoolean(detail.grading.enabled)} />
        <DetailItem label="Mode" value={detail.grading.mode} />
        <DetailItem label="Artifact name" value={detail.grading.artifact} />
        <DetailItem label="Result file" value={detail.grading.resultFile} />
        <StatusItem label="Workflow status" value={detail.grading.workflowStatus} />
        <StatusItem label="Workflow dispatch status" value={detail.grading.workflowDispatch} />
      </dl>
    )}
  </section>
);
