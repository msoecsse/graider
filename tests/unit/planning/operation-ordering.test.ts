import { describe, expect, it } from "vitest";
import type { PlanOperation } from "../../../src/planning/operation-models.js";
import {
  comparePlanOperations,
  createOperationId
} from "../../../src/planning/operation-ordering.js";

const EMPTY_DIAGNOSTICS = [] as const;

const createOperation = (
  section: string,
  studentId: string,
  type: PlanOperation["type"]
): PlanOperation => ({
  id: createOperationId(section, studentId, type),
  type,
  status: "planned",
  requires: [],
  student_id: studentId,
  section,
  warnings: [...EMPTY_DIAGNOSTICS],
  errors: [...EMPTY_DIAGNOSTICS]
});

describe("plan operation ordering", () => {
  it("orders operations by section, student ID, and operation type order", () => {
    const operations = [
      createOperation("002", "patel", "verify_workflow_dispatch"),
      createOperation("001", "smith", "add_student_collaborator"),
      createOperation("001", "jones", "enable_actions"),
      createOperation("001", "jones", "create_repository_from_template"),
      createOperation("001", "jones", "add_faculty_team_permission")
    ];

    expect([...operations].sort(comparePlanOperations).map((operation) => operation.id)).toEqual([
      "001:jones:create_repository_from_template",
      "001:jones:add_faculty_team_permission",
      "001:jones:enable_actions",
      "001:smith:add_student_collaborator",
      "002:patel:verify_workflow_dispatch"
    ]);
  });

  it("creates deterministic operation IDs", () => {
    expect(createOperationId("001", "jones", "create_repository_from_template")).toBe(
      "001:jones:create_repository_from_template"
    );
  });
});
