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

export type GradingSource = "course" | "assignment";

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
  course: RawCourseConfig;
  term: RawTermConfig;
  assignment: RawAssignmentConfig;
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
