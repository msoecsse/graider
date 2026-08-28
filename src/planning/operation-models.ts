import type { Diagnostic } from "../diagnostics/diagnostic.js";

export const PLAN_OPERATION_TYPES = [
  "create_repository_from_template",
  "add_student_collaborator",
  "add_faculty_team_permission",
  "add_grader_team_permission",
  "enable_actions",
  "verify_grading_workflow",
  "verify_workflow_dispatch"
] as const;

export type PlanOperationType = (typeof PLAN_OPERATION_TYPES)[number];

export type PlanOperationStatus = "planned" | "noop" | "skipped" | "blocked";

export interface PlanOperation {
  id: string;
  type: PlanOperationType;
  status: PlanOperationStatus;
  requires: string[];
  target_id?: string;
  student_id?: string;
  github_username?: string;
  section?: string;
  repository_name?: string;
  reason?: string;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}
