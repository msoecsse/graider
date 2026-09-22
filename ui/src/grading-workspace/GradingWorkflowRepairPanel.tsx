import type { ReactElement } from "react";
import type { GradingBulkWorkflowRepairResult } from "../../electron/ipc";
import { ConfirmationWithPreviewModal } from "../components/ConfirmationWithPreviewModal";

export type WorkflowRepairState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly studentId: string }
  | { readonly status: "ready"; readonly studentId: string; readonly repositoryFullName: string }
  | { readonly status: "unavailable"; readonly studentId: string; readonly message: string }
  | { readonly status: "running"; readonly studentId: string; readonly repositoryFullName: string };

export interface WorkflowRepairConfirmation {
  readonly studentId: string;
  readonly repositoryFullName: string;
}

export interface WorkflowRepairNotice {
  readonly studentId: string;
  readonly tone: "success" | "warning" | "error";
  readonly message: string;
}

export type BulkWorkflowRepairState = "idle" | "running";

export const GradingWorkflowRepairPanel = ({
  workflowRepair,
  onOpenWorkflowRepairConfirmation,
  workflowRepairNotice,
  studentId,
  bulkWorkflowRepairState,
  bulkRepairAvailable,
  onOpenBulkWorkflowRepairConfirmation,
  bulkWorkflowRepairResult,
  bulkWorkflowRepairConfirmation,
  onCancelBulkWorkflowRepairConfirmation,
  onConfirmBulkWorkflowRepair,
  workflowRepairConfirmation,
  onCancelWorkflowRepairConfirmation,
  onConfirmWorkflowRepair
}: {
  readonly workflowRepair: WorkflowRepairState;
  readonly onOpenWorkflowRepairConfirmation: () => void;
  readonly workflowRepairNotice: WorkflowRepairNotice | undefined;
  readonly studentId: string | undefined;
  readonly bulkWorkflowRepairState: BulkWorkflowRepairState;
  readonly bulkRepairAvailable: boolean;
  readonly onOpenBulkWorkflowRepairConfirmation: () => void;
  readonly bulkWorkflowRepairResult: GradingBulkWorkflowRepairResult | undefined;
  readonly bulkWorkflowRepairConfirmation: boolean;
  readonly onCancelBulkWorkflowRepairConfirmation: () => void;
  readonly onConfirmBulkWorkflowRepair: () => void;
  readonly workflowRepairConfirmation: WorkflowRepairConfirmation | undefined;
  readonly onCancelWorkflowRepairConfirmation: () => void;
  readonly onConfirmWorkflowRepair: () => void;
}): ReactElement => (
  <section className="grading-workflow-repair" aria-labelledby="workflow-repair-heading">
    <h3 id="workflow-repair-heading">Workflow</h3>
    <button
      className="secondary-action"
      type="button"
      disabled={workflowRepair.status !== "ready"}
      onClick={onOpenWorkflowRepairConfirmation}
    >
      {workflowRepair.status === "running" ? "Replacing workflow…" : "Replace workflow & run"}
    </button>
    {workflowRepair.status === "loading" ? (
      <p aria-live="polite">Checking workflow repair availability…</p>
    ) : workflowRepair.status === "unavailable" ? (
      <p>{workflowRepair.message}</p>
    ) : null}
    {workflowRepairNotice === undefined || workflowRepairNotice.studentId !== studentId ? null : (
      <p
        role="status"
        className={`grading-panel-message grading-panel-message--${workflowRepairNotice.tone}`}
      >
        {workflowRepairNotice.message}
      </p>
    )}
    <button
      className="secondary-action"
      type="button"
      disabled={bulkWorkflowRepairState === "running" || !bulkRepairAvailable}
      onClick={onOpenBulkWorkflowRepairConfirmation}
    >
      {bulkWorkflowRepairState === "running"
        ? "Replacing workflows…"
        : "Replace workflows & run for all students"}
    </button>
    {bulkWorkflowRepairResult?.status === "success" ? (
      <div role="status">
        <p>
          {bulkWorkflowRepairResult.counts.succeeded} succeeded ·{" "}
          {bulkWorkflowRepairResult.counts.failed} failed ·{" "}
          {bulkWorkflowRepairResult.counts.createdOrReplaced} replaced ·{" "}
          {bulkWorkflowRepairResult.counts.alreadyCurrent} already current ·{" "}
          {bulkWorkflowRepairResult.counts.dispatched} dispatched
        </p>
        {bulkWorkflowRepairResult.repositoryResults
          .filter((item) => item.status === "failed")
          .map((item) => (
            <p key={`${item.repository ?? item.studentIds.join("-")}`}>
              {item.repository ?? item.studentIds.join(", ")}:{" "}
              {item.message ?? "Workflow repair failed."}
            </p>
          ))}
      </div>
    ) : null}
    <ConfirmationWithPreviewModal
      isOpen={bulkWorkflowRepairConfirmation}
      title="Replace workflows and start grading runs?"
      summary={
        <p>
          Install or replace Graider's managed grade.yml where necessary and run grading for all
          mapped, authorized student repositories?
        </p>
      }
      acknowledgementLabel="I understand this replaces repository grading workflows."
      confirmLabel="Confirm replace workflows & run for all students"
      onConfirm={onConfirmBulkWorkflowRepair}
      // confirmBulkWorkflowRepair closes this modal itself, immediately, before
      // the repair even starts, and reports the outcome through
      // bulkWorkflowRepairResult above. A generic toast here would arrive well
      // after the fact and duplicate that reporting.
      onSuccess={() => undefined}
      onCancel={onCancelBulkWorkflowRepairConfirmation}
    />
    <ConfirmationWithPreviewModal
      isOpen={
        workflowRepairConfirmation !== undefined &&
        workflowRepairConfirmation.studentId === studentId
      }
      title="Replace workflow and start grading run?"
      summary={
        <p>
          Replace .github/workflows/grade.yml in {workflowRepairConfirmation?.repositoryFullName}{" "}
          with the Graider-managed workflow and start a grading run?
        </p>
      }
      acknowledgementLabel="I understand this replaces the repository's grading workflow."
      confirmLabel="Confirm replace workflow & run"
      onConfirm={onConfirmWorkflowRepair}
      // confirmWorkflowRepair never rejects and already closes this modal
      // itself, reporting every outcome -- success and error alike -- through
      // workflowRepairNotice above, independent of this component's
      // success/error contract. A generic toast here would be redundant on
      // success and misleading on failure.
      onSuccess={() => undefined}
      onCancel={onCancelWorkflowRepairConfirmation}
    />
  </section>
);
