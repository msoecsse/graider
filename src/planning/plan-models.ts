import type { SourceFileHash } from "../config/source-fingerprint.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { PlanOperation } from "./operation-models.js";
import type { ApplyRepositoryTarget } from "./repository-targets.js";

export const PLAN_SCHEMA_VERSION = 1;

export interface PlanAssignment {
  term_code: string;
  course_code: string;
  assignment_slug: string;
  assignment_title: string;
}

export interface PlanSource {
  source_files: SourceFileHash[];
  input_fingerprint: string;
}

export interface PlanSummary {
  total_students: number;
  active_students: number;
  dropped_students: number;
  hold_students: number;
  planned_operations: number;
  noop_operations: number;
  skipped_operations: number;
  blocked_operations: number;
}

export interface Plan {
  schema_version: typeof PLAN_SCHEMA_VERSION;
  created_at: string;
  assignment: PlanAssignment;
  source: PlanSource;
  summary: PlanSummary;
  operations: PlanOperation[];
  targets: ApplyRepositoryTarget[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}
