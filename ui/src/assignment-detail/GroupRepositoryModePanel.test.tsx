import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AssignmentGroupConfigResult } from "../../electron/ipc";
import { GroupRepositoryModePanel } from "./GroupRepositoryModePanel";

const createGroupConfig = (
  overrides: Partial<AssignmentGroupConfigResult> = {}
): AssignmentGroupConfigResult => ({
  status: "ready",
  repositoryMode: "individual",
  groupsFile: "groups.csv",
  groupsCsv: "group_id,student_id\n",
  groupCount: 0,
  groupedStudentCount: 0,
  ungroupedActiveStudentCount: 3,
  diagnostics: [],
  ...overrides
});

describe("GroupRepositoryModePanel", () => {
  it("shows group membership fields and counts only in group mode", () => {
    const onGroupModeChange = vi.fn();
    render(
      <GroupRepositoryModePanel
        groupConfig={createGroupConfig({
          repositoryMode: "group",
          groupsCsv: "group_id,student_id\ng1,s001\n",
          groupCount: 1,
          groupedStudentCount: 1,
          ungroupedActiveStudentCount: 2
        })}
        groupMode="group"
        groupsCsv="group_id,student_id\ng1,s001\n"
        isSavingGroupConfig={false}
        groupConfigFeedback={null}
        onGroupModeChange={onGroupModeChange}
        onGroupsCsvChange={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Group membership CSV")).toBeInTheDocument();
    expect(
      screen.getByText(/1 groups, 1 grouped students, 2 ungrouped active students\./u)
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Repository mode" }), {
      target: { value: "individual" }
    });
    expect(onGroupModeChange).toHaveBeenCalledWith("individual");
  });

  it("hides group fields, and warns about a retained groups.csv, in individual mode", () => {
    render(
      <GroupRepositoryModePanel
        groupConfig={createGroupConfig({ groupsCsv: "group_id,student_id\ng1,s001\n" })}
        groupMode="individual"
        groupsCsv="group_id,student_id\ng1,s001\n"
        isSavingGroupConfig={false}
        groupConfigFeedback="Repository mode saved."
        onGroupModeChange={vi.fn()}
        onGroupsCsvChange={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Group membership CSV")).toBeNull();
    expect(
      screen.getByText(
        "Existing groups.csv is retained and ignored while Individual repositories is selected."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Repository mode saved.")).toBeInTheDocument();
  });
});
