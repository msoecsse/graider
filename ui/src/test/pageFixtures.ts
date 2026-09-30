import type { AssignmentGradingLifecycleResult } from "../../electron/ipc";

type SuccessfulAssignmentGradingLifecycle = Extract<
  AssignmentGradingLifecycleResult,
  { readonly status: "success" }
>;

const DEFAULT_STUDENTS: SuccessfulAssignmentGradingLifecycle["students"] = [
  {
    studentId: "s001",
    githubUsername: "ada",
    section: "001",
    gradingStatus: "not_started",
    score: null
  },
  {
    studentId: "s002",
    githubUsername: "grace",
    section: "001",
    gradingStatus: "in_progress",
    score: null
  },
  {
    studentId: "s003",
    githubUsername: "lin",
    section: "001",
    gradingStatus: "published",
    score: 90
  }
];

export const createDefaultAssignmentGradingLifecycle = (
  overrides: Partial<SuccessfulAssignmentGradingLifecycle> = {}
): AssignmentGradingLifecycleResult => ({
  status: "success",
  students: DEFAULT_STUDENTS.map((student) => ({ ...student })),
  totalStudentCount: DEFAULT_STUDENTS.length,
  gradingDoneCount: 1,
  publishedCount: 1,
  unknownStatusCount: 0,
  pointsPossible: 100,
  ...overrides
});
