import type { ReactElement } from "react";
import {
  CopyButton,
  DetailItem,
  StatusItem,
  type CopyKey,
  type CopyState
} from "./AssignmentDetailPrimitives";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

const displayBoolean = (value: boolean): string => (value ? "Enabled" : "Disabled");

export const GradingPanel = ({
  detail,
  copyState,
  onCopy
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly copyState: CopyState | null;
  readonly onCopy: (copyKey: CopyKey, value: string) => void;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="grading-readiness-title">
    <h2 id="grading-readiness-title">Grading</h2>
    {!detail.grading.enabled ? (
      <p className="detail-panel__note">No grading configured.</p>
    ) : (
      <dl className="detail-grid">
        <DetailItem label="Enabled" value={displayBoolean(detail.grading.enabled)} />
        <DetailItem label="Mode" value={detail.grading.mode} />
        <DetailItem
          label="Workflow path"
          value={detail.grading.workflow}
          valueClassName="copyable-value"
          action={
            <CopyButton
              label="Copy workflow path"
              value={detail.grading.workflow}
              copyKey="workflow-path"
              copyState={copyState}
              onCopy={onCopy}
            />
          }
        />
        <DetailItem label="Artifact name" value={detail.grading.artifact} />
        <DetailItem label="Result file" value={detail.grading.resultFile} />
        <StatusItem label="Workflow status" value={detail.grading.workflowStatus} />
        <StatusItem label="Workflow dispatch status" value={detail.grading.workflowDispatch} />
      </dl>
    )}
  </section>
);
