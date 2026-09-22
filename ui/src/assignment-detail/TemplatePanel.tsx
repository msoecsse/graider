import type { ReactElement } from "react";
import {
  CopyButton,
  DetailItem,
  StatusItem,
  type CopyKey,
  type CopyState
} from "./AssignmentDetailPrimitives";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

export const TemplatePanel = ({
  detail,
  copyState,
  onCopy
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly copyState: CopyState | null;
  readonly onCopy: (copyKey: CopyKey, value: string) => void;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="template-readiness-title">
    <h2 id="template-readiness-title">Template</h2>
    <dl className="detail-grid">
      <DetailItem
        label="Repository"
        value={detail.template.repository}
        valueClassName="copyable-value"
        action={
          <CopyButton
            label="Copy template repository"
            value={detail.template.repository}
            copyKey="template-repository"
            copyState={copyState}
            onCopy={onCopy}
          />
        }
      />
      <DetailItem label="Branch" value={detail.template.branch} />
      <StatusItem label="Overall status" value={detail.template.status} />
      <StatusItem label="Repository status" value={detail.template.repositoryStatus} />
      <StatusItem label="Branch status" value={detail.template.branchStatus} />
    </dl>
  </section>
);
