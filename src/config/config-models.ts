import type { z } from "zod";
import type {
  rawAssignmentConfigSchema,
  rawCourseConfigSchema,
  rawCourseConfigV1Schema,
  rawCourseConfigV2Schema,
  facultyIdentitySchema,
  rawTermConfigSchema,
  rawTermConfigV1Schema,
  rawTermConfigV2Schema,
  TERM_LIFECYCLE_STATUSES
} from "./config-schemas.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

export type FacultyIdentity = z.infer<typeof facultyIdentitySchema>;
export type RawCourseConfigV1 = z.infer<typeof rawCourseConfigV1Schema>;
export type RawCourseConfigV2 = z.infer<typeof rawCourseConfigV2Schema>;
export type RawCourseConfig = z.infer<typeof rawCourseConfigSchema>;
export type RawTermConfigV1 = z.infer<typeof rawTermConfigV1Schema>;
export type RawTermConfigV2 = z.infer<typeof rawTermConfigV2Schema>;
export type TermLifecycleStatus = (typeof TERM_LIFECYCLE_STATUSES)[number];
export type RawTermConfig = z.infer<typeof rawTermConfigSchema>;
export type RawAssignmentConfig = z.infer<typeof rawAssignmentConfigSchema>;

export type ResolvedCourseConfig = RawCourseConfig;

export type ResolvedAssignmentConfig = RawAssignmentConfig;

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
