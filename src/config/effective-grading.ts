import type { LoadedGraiderConfig, RawAssignmentConfig, RawCourseConfig } from "./config-models.js";

type ConfiguredGrading = NonNullable<RawCourseConfig["grading"] | RawAssignmentConfig["grading"]>;

export type EffectiveAssignmentGrading = Omit<ConfiguredGrading, "enabled"> & {
  readonly enabled: boolean;
};

export const resolveEffectiveAssignmentGrading = (
  courseGrading: RawCourseConfig["grading"],
  assignmentGrading: RawAssignmentConfig["grading"]
): EffectiveAssignmentGrading => {
  if (assignmentGrading !== undefined)
    return {
      ...assignmentGrading,
      enabled: assignmentGrading.enabled ?? false
    };
  if (courseGrading !== undefined) return { ...courseGrading };
  return { enabled: false };
};

/** Returns the assignment override resolved by the config loader, or the course default. */
export const getEffectiveAssignmentGrading = (
  config: LoadedGraiderConfig
): EffectiveAssignmentGrading =>
  resolveEffectiveAssignmentGrading(config.course.grading, config.assignment.grading);
