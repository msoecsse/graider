import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingWorkflowRepairPanel } from "./GradingWorkflowRepairPanel";

const baseProps = {
  workflowRepair: {
    status: "ready" as const,
    studentId: "ada",
    repositoryFullName: "org/ada-lab02"
  },
  onOpenWorkflowRepairConfirmation: vi.fn(),
  workflowRepairNotice: undefined,
  studentId: "ada",
  bulkWorkflowRepairState: "idle" as const,
  bulkRepairAvailable: true,
  onOpenBulkWorkflowRepairConfirmation: vi.fn(),
  bulkWorkflowRepairResult: undefined,
  bulkWorkflowRepairConfirmation: false,
  onCancelBulkWorkflowRepairConfirmation: vi.fn(),
  onConfirmBulkWorkflowRepair: vi.fn(),
  workflowRepairConfirmation: undefined,
  onCancelWorkflowRepairConfirmation: vi.fn(),
  onConfirmWorkflowRepair: vi.fn()
};

describe("GradingWorkflowRepairPanel", () => {
  it("enables the per-student repair button when ready and opens its confirmation", () => {
    const onOpenWorkflowRepairConfirmation = vi.fn();
    render(
      <GradingWorkflowRepairPanel
        {...baseProps}
        onOpenWorkflowRepairConfirmation={onOpenWorkflowRepairConfirmation}
      />
    );

    const button = screen.getByRole("button", { name: "Replace workflow & run" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onOpenWorkflowRepairConfirmation).toHaveBeenCalledTimes(1);
  });

  it("disables the bulk repair button when unavailable and shows a success notice", () => {
    render(
      <GradingWorkflowRepairPanel
        {...baseProps}
        bulkRepairAvailable={false}
        bulkWorkflowRepairResult={{
          status: "success",
          studentIds: ["ada", "bea"],
          counts: {
            total: 2,
            succeeded: 2,
            failed: 0,
            createdOrReplaced: 1,
            alreadyCurrent: 1,
            dispatched: 2,
            dispatchFailed: 0
          },
          repositoryResults: []
        }}
      />
    );

    expect(
      screen.getByRole("button", { name: "Replace workflows & run for all students" })
    ).toBeDisabled();
    expect(screen.getByText(/2 succeeded/)).toBeInTheDocument();
  });

  it("shows the per-student notice only for the currently selected student", () => {
    render(
      <GradingWorkflowRepairPanel
        {...baseProps}
        workflowRepairNotice={{ studentId: "bea", tone: "success", message: "Workflow replaced." }}
      />
    );

    expect(screen.queryByText("Workflow replaced.")).toBeNull();
  });
});
