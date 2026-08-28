import type { z } from "zod";
import type {
  rawAssignmentConfigSchema,
  rawCourseConfigSchema,
  rawTermConfigSchema
} from "./config-schemas.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

export type RawCourseConfig = z.infer<typeof rawCourseConfigSchema>;
export type RawTermConfig = z.infer<typeof rawTermConfigSchema>;
export type RawAssignmentConfig = z.infer<typeof rawAssignmentConfigSchema>;

export type ResolvedCourseConfig = RawCourseConfig & {
  readonly grading: NonNullable<RawCourseConfig["grading"]>;
};

export type ResolvedAssignmentConfig = RawAssignmentConfig & {
  readonly template: NonNullable<RawAssignmentConfig["template"]>;
};

export type GradingSource = "course" | "assignment" | "none";

export interface LoadedGraiderConfigSummary {
  repoRoot: string;
  courseConfigPath: string;
  termConfigPath: string;
  assignmentConfigPath: string;
  assignmentRelativePath: string;
  termCode: string;
  assignmentSlug: string;
  gradingEnabled: boolean;
  gradingSource: GradingSource;
}

export interface LoadedGraiderConfig {
  course: ResolvedCourseConfig;
  term: RawTermConfig;
  assignment: ResolvedAssignmentConfig;
  summary: LoadedGraiderConfigSummary;
}

export type ConfigLoadResult =
  | {
      status: "success";
      config: LoadedGraiderConfig;
      diagnostics: Diagnostic[];
    }
  | {
      status: "failure";
      diagnostics: Diagnostic[];
    };

export interface ConfigLoadRequest {
  cwd: string;
  assignmentFile: string;
}
