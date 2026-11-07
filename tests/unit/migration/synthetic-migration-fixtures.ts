import { reviewFixture, completeSubmission } from "./migration-review-fixtures.js";
import { stringify } from "yaml";
import type { MigrationSnapshot } from "../../../src/migration/migration-models.js";
import {
  fixture,
  course,
  term,
  assignment,
  putTerm,
  OTHER_ORGANIZATION_ID
} from "./migration-fixtures.js";

/** Fictional, deterministic snapshots; directly materializable with copyFixtureFiles in local Git. */
export interface SyntheticCourseOptions {
  sourceSha?: string;
  lifecycle?: "active" | "archived";
  authorization?: readonly string[];
  sourceFiles?: Record<string, string>;
  runtimeFiles?: Record<string, string>;
  studentObservations?: MigrationSnapshot["studentObservations"];
}
const SHA_LENGTH = 40;
export const gradingPath = ".graider/grading/27s1/lab04/state/student001.json";
export const commentPath = ".graider/grading/comments.json";
export const gradingRecord = () => ({
  schemaVersion: 1,
  studentId: "student001",
  submissionCommitSha: "e".repeat(SHA_LENGTH),
  status: "in_progress",
  appliedComments: [
    {
      id: "applied-one",
      sourceCommentId: "missing-library-entry",
      text: "Fictional snapshot",
      deduction: -1
    }
  ],
  manualAdjustments: []
});
export const BasicCourse = (options: SyntheticCourseOptions = {}): MigrationSnapshot => {
  const input = fixture();
  const config = structuredClone(course);
  config.course.repository = "fictional-course";
  config.github.organization = "fictional-academy";
  delete config.github.grader_team;
  delete config.github.grader_permission;
  input.binding.repositoryName = config.course.repository;
  input.binding.organizationLogin = config.github.organization;
  input.sourceFiles = { "course.yml": stringify(config) };
  const single = structuredClone(term);
  single.sections = [
    { id: "001", faculty: [...(options.authorization ?? ["jones"])], roster: "rosters/001.csv" }
  ];
  const task = structuredClone(assignment);
  task.sections = ["001"];
  task.assignment.status = options.lifecycle ?? "active";
  putTerm(input, single, [task]);
  input.sourceFiles = {
    ...input.sourceFiles,
    [gradingPath]: JSON.stringify(gradingRecord()),
    ...options.sourceFiles
  };
  if (options.sourceSha) {
    input.binding.sourceCommitSha = options.sourceSha;
    if (input.history)
      input.history = {
        ...input.history,
        sourceCommitSha: options.sourceSha,
        commits: input.history.commits.map((commit) =>
          commit.sha === fixture().binding.sourceCommitSha
            ? { ...commit, sha: input.binding.sourceCommitSha }
            : commit
        )
      };
  }
  if (options.runtimeFiles)
    input.runtime = { coverage: "machine_local", files: options.runtimeFiles };
  if (options.studentObservations) input.studentObservations = options.studentObservations;
  return input;
};
export const MultiSectionCourse = (options: SyntheticCourseOptions = {}) => {
  const input = BasicCourse(options);
  putTerm(input);
  const historical = structuredClone(term);
  historical.term = {
    code: "26s2",
    academic_year: 2026,
    semester: 2,
    display_name: "Fictional autumn"
  };
  const task = structuredClone(assignment);
  task.assignment.slug = "lab05";
  putTerm(input, historical, [task]);
  return input;
};
export const HistoricalCourse = (options: SyntheticCourseOptions = {}) =>
  BasicCourse({ lifecycle: "archived", ...options });
export const IncompleteCourse = (options: SyntheticCourseOptions = {}) =>
  BasicCourse({ sourceFiles: { [gradingPath]: "{damaged" }, ...options });
export const ConflictCourse = (options: SyntheticCourseOptions = {}) => {
  const input = BasicCourse(options);
  input.binding.historicalOrganizationId = OTHER_ORGANIZATION_ID;
  return input;
};

/** V1 has no term lifecycle/history fields. Supply archived decisions through review,
 * rather than inventing source metadata or former faculty intervals. */
export const historicalCourseReview = (options: SyntheticCourseOptions = {}) => {
  const input = HistoricalCourse(options);
  const context = reviewFixture(input);
  const submitted = completeSubmission(context);
  const submission = {
    ...submitted,
    terms: submitted.terms.map((entry) => ({
      ...entry,
      status: "archived" as const,
      hasEverBeenActive: true
    }))
  };
  return { input, context, submission };
};
