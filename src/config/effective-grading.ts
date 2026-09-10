import type {
  LoadedGraiderConfig,
  RawAssignmentConfig,
  RawCourseConfig,
  ResolvedCourseConfig
} from "./config-models.js";

/**
 * Grading configuration after the assignment override is applied over the course default.
 *
 * The course config is resolved during loading, so a grading block is always present; the
 * assignment block only overrides it. Keeping the return type non-optional preserves that
 * guarantee for callers instead of re-widening it to the raw schema type.
 */
export type EffectiveGradingConfig = NonNullable<RawCourseConfig["grading"]>;

export const getEffectiveGrading = (config: LoadedGraiderConfig): EffectiveGradingConfig =>
  config.assignment.grading ?? config.course.grading;

export const resolveEffectiveGrading = (
  courseConfig: ResolvedCourseConfig,
  assignmentConfig: RawAssignmentConfig
): EffectiveGradingConfig => assignmentConfig.grading ?? courseConfig.grading;
