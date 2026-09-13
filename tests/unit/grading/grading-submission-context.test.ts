import { describe, expect, it, vi } from "vitest";
import { resolveGradingSubmissionContext } from "../../../src/grading/grading-submission-context.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const request = {
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada",
  currentSubmissionCommitSha: SHA
};

const state = (
  submissionCommitSha = SHA,
  status: "not_started" | "in_progress" | "complete" | "published" = "published"
) => ({
  status: "success" as const,
  value: {
    schemaVersion: 1 as const,
    studentId: "ada",
    submissionCommitSha,
    status,
    appliedComments: [],
    manualAdjustments: []
  }
});

describe("trusted grading submission context", () => {
  it("uses trusted local HEAD for missing state without writing grading state", () => {
    const loadState = vi.fn().mockReturnValue({ status: "missing" });
    expect(resolveGradingSubmissionContext(request, { loadState })).toEqual({
      status: "success",
      value: { studentId: "ada", submissionCommitSha: SHA }
    });
    expect(loadState).toHaveBeenCalledOnce();
  });

  it.each(["not_started", "in_progress", "complete", "published"] as const)(
    "keeps %s state anchored to its persisted SHA",
    (status) => {
      expect(
        resolveGradingSubmissionContext(request, { loadState: () => state(SHA, status) })
      ).toEqual({
        status: "success",
        value: { studentId: "ada", submissionCommitSha: SHA }
      });
    }
  );

  it("preserves submission_changed instead of replacing the persisted SHA with HEAD", () => {
    expect(resolveGradingSubmissionContext(request, { loadState: () => state(OTHER_SHA) })).toEqual(
      { status: "submission_changed", studentId: "ada" }
    );
  });

  it("requires HEAD only when grading state is missing and safely maps invalid state", () => {
    const withoutHead = { ...request, currentSubmissionCommitSha: undefined };
    expect(
      resolveGradingSubmissionContext(withoutHead, { loadState: () => ({ status: "missing" }) })
    ).toEqual({ status: "submission_commit_unavailable" });
    expect(
      resolveGradingSubmissionContext(request, {
        loadState: () => ({ status: "failure", code: "invalid_json", message: "private path" })
      })
    ).toEqual({ status: "grading_state_error", studentId: "ada", code: "invalid_json" });
  });
});
