import type { ReactElement } from "react";
import type { TemplateWorkflowResult, TemplateWorkflowSavePreview } from "../../electron/ipc";
import { DetailItem } from "./AssignmentDetailPrimitives";
import { formatStatusLabel } from "../components/statusLabels";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

export const GradeWorkflowPanel = ({
  detail,
  workflowResult,
  draft,
  preview,
  isLoading,
  isPushing,
  onViewWorkflow,
  onDraftChange,
  onPreview,
  onPush
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly workflowResult: TemplateWorkflowResult | null;
  readonly draft: string;
  readonly preview: TemplateWorkflowSavePreview | null;
  readonly isLoading: boolean;
  readonly isPushing: boolean;
  readonly onViewWorkflow: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onPreview: () => void;
  readonly onPush: () => void;
}): ReactElement => {
  const isConfigured =
    detail.grading.enabled &&
    detail.template.repository !== null &&
    detail.template.branch !== null;

  return (
    <section className="detail-panel grade-workflow-panel" aria-labelledby="grade-workflow-title">
      <div className="grade-workflow-panel__header">
        <div>
          <h2 id="grade-workflow-title" tabIndex={-1}>
            Grade workflow
          </h2>
          <p className="detail-panel__note">
            Workflow changes are not saved in this version. Saving to the template repository will
            be added in a later slice.
          </p>
        </div>
        <button
          className="secondary-action"
          type="button"
          disabled={!isConfigured || isLoading}
          onClick={onViewWorkflow}
        >
          {isLoading ? "Loading workflow..." : "View workflow"}
        </button>
      </div>
      {!isConfigured ? (
        <p className="detail-panel__note">Grading or the template repository is not configured.</p>
      ) : null}
      {workflowResult === null ? null : (
        <>
          <dl className="detail-grid">
            <DetailItem label="Repository" value={workflowResult.repository} />
            <DetailItem label="Branch" value={workflowResult.branch} />
            <DetailItem label="Workflow path" value={workflowResult.path} />
            <DetailItem label="Fetch status" value={formatStatusLabel(workflowResult.status)} />
          </dl>
          {workflowResult.diagnostics.map((item) => (
            <p className="error-message" role="alert" key={item.message}>
              {item.message}
            </p>
          ))}
          {workflowResult.status === "missing" ? (
            <p className="detail-panel__note">Start a workflow draft here. It is not saved yet.</p>
          ) : null}
          {workflowResult.status === "success" || workflowResult.status === "missing" ? (
            <textarea
              aria-label="Grade workflow draft"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              rows={16}
            />
          ) : null}
          {preview === null ? null : (
            <>
              <p className={preview.status === "ready" ? "detail-panel__note" : "error-message"}>
                {preview.diagnostics.map((item) => item.message).join(" ") ||
                  `${preview.operation} ready`}
              </p>
              <p className="detail-panel__note">
                This will commit directly to the template repository branch used by this assignment.
              </p>
              <dl className="detail-grid">
                <DetailItem label="Operation" value={preview.operation} />
                <DetailItem label="Commit message" value={preview.commitMessage} />
              </dl>
            </>
          )}
          {workflowResult.status === "success" || workflowResult.status === "missing" ? (
            <button
              className="secondary-action"
              type="button"
              disabled={isLoading || isPushing || draft === workflowResult.content}
              onClick={onPreview}
            >
              Preview save
            </button>
          ) : null}
          <button
            className="primary-action"
            type="button"
            disabled={preview?.status !== "ready" || isPushing}
            onClick={onPush}
          >
            {isPushing ? "Pushing..." : "Confirm push"}
          </button>
        </>
      )}
    </section>
  );
};
