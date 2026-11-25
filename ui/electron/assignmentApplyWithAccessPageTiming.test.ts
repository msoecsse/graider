import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAssignment } from "./assignmentApplyRunner.js";
import { getAssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";
import { generateStudentRepositoryAccessPage } from "./studentRepositoryAccessPageService.js";
import { publishStudentRepositoryAccessPage } from "./studentRepositoryAccessPagePublishService.js";
import { applyAssignmentWithStudentRepositoryAccessPage } from "./assignmentApplyWithAccessPageService.js";
import type { AssignmentApplyResult } from "./ipc.js";

vi.mock("./assignmentApplyRunner.js", () => ({ applyAssignment: vi.fn() }));
vi.mock("./assignmentRepositoryMappingsRunner.js", () => ({
  getAssignmentRepositoryMappings: vi.fn()
}));
vi.mock("./studentRepositoryAccessPageService.js", () => ({
  generateStudentRepositoryAccessPage: vi.fn()
}));
vi.mock("./studentRepositoryAccessPagePublishService.js", () => ({
  publishStudentRepositoryAccessPage: vi.fn()
}));

const APPLY_MS = 7;
const MAPPINGS_MS = 11;
const GENERATION_MS = 13;
const PUBLICATION_MS = 17;
const request = {
  courseFolderId: "private-course-id",
  courseFolderPath: "private-course-path",
  assignmentFile: "private-assignment.yml"
};
const options = {
  runner: vi.fn(),
  env: { GRAIDER_GITHUB_TOKEN: "ghp_private_token" },
  pagesRepositoryFolderPath: "private-pages-path"
};
const githubPerformance = Object.freeze({
  elapsedMs: APPLY_MS,
  phases: { readiness: { elapsedMs: APPLY_MS } },
  authorityValidation: { elapsedMs: APPLY_MS }
});
const summary = Object.freeze({ created: 1, githubPerformance });
const original: AssignmentApplyResult = {
  ...request,
  status: "success",
  apply: {
    schemaVersion: 1,
    commandName: "assignment apply",
    assignmentFile: request.assignmentFile,
    status: "partial_success",
    exitCode: 2,
    diagnostics: [],
    warnings: [],
    errors: [],
    generatedFiles: [],
    summary
  },
  error: null,
  appliedAt: "2026-11-21T12:00:00.000Z"
};

describe("Apply access-page aggregate timing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["performance"] });
    vi.mocked(applyAssignment).mockImplementation(async () => {
      vi.advanceTimersByTime(APPLY_MS);
      return original;
    });
    vi.mocked(getAssignmentRepositoryMappings).mockImplementation(async () => {
      vi.advanceTimersByTime(MAPPINGS_MS);
      return {
        manifestStatus: "present",
        mappings: [
          {
            studentId: "private-student-id",
            githubUsername: "private-username",
            targetId: "private-target-id",
            repositoryName: "private-repository",
            repositoryUrl: "https://example.invalid/private-repository"
          }
        ],
        diagnostics: []
      };
    });
    vi.mocked(generateStudentRepositoryAccessPage).mockImplementation(async () => {
      vi.advanceTimersByTime(GENERATION_MS);
      return {
        schemaVersion: 1,
        assignmentFile: request.assignmentFile,
        termCode: null,
        assignmentSlug: null,
        outputPath: "private-output.html",
        pagesRepository: "private-pages-repository",
        pagesRepositoryFolderSelected: true,
        pagesUrl: "https://example.invalid/private-page",
        generatedAt: null,
        exists: true,
        status: "generated",
        summary: {
          activeStudents: 1,
          includedStudents: 1,
          skippedInactive: 0,
          missingRepository: 0
        },
        rows: [],
        diagnostics: []
      };
    });
    vi.mocked(publishStudentRepositoryAccessPage).mockImplementation(async () => {
      vi.advanceTimersByTime(PUBLICATION_MS);
      return { status: "success", diagnostics: [], commitMessage: "private-commit-body" };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const expectTiming = (result: AssignmentApplyResult, generation = true, publication = true) => {
    expect(result).toEqual({
      ...original,
      ...(result.accessPageError ? { accessPageError: result.accessPageError } : {}),
      apply: {
        ...original.apply,
        summary: {
          ...summary,
          accessPagePerformance: {
            elapsedMs:
              MAPPINGS_MS + (generation ? GENERATION_MS : 0) + (publication ? PUBLICATION_MS : 0),
            phases: {
              repositoryMappings: { elapsedMs: MAPPINGS_MS },
              generation: generation ? { elapsedMs: GENERATION_MS } : null,
              publication: publication ? { elapsedMs: PUBLICATION_MS } : null
            }
          }
        }
      }
    });
    expect(result.apply?.summary.githubPerformance).toBe(githubPerformance);
    expect(original.apply?.summary).toEqual(summary);
    // An exact numeric-only shape also excludes identities, URLs, credentials,
    // headers, bodies and exception details from the new telemetry.
    expect(JSON.stringify(result.apply?.summary.accessPagePerformance)).not.toMatch(
      /private|https:|ghp_|authorization|body/iu
    );
  };

  it("times only follow-up work without changing Apply totals or partial outcomes", async () => {
    const result = await applyAssignmentWithStudentRepositoryAccessPage(request, options);
    expectTiming(result);
    expect(result.accessPageError).toBeUndefined();
  });

  it.each(["failure", "throw"] as const)(
    "records publication timing on %s while retaining successful Apply transport",
    async (outcome) => {
      vi.mocked(publishStudentRepositoryAccessPage).mockImplementation(async () => {
        vi.advanceTimersByTime(PUBLICATION_MS);
        if (outcome === "throw")
          throw new Error(
            "ghp_private_token Authorization: private-header private-body https://example.invalid"
          );
        return {
          status: "failure",
          diagnostics: [{ message: "Unable to push." }],
          commitMessage: null
        };
      });
      const result = await applyAssignmentWithStudentRepositoryAccessPage(request, options);
      expectTiming(result);
      expect(result.accessPageError?.code).toBe(
        "student_repository_access_page_publication_failed"
      );
      expect(JSON.stringify(result)).not.toMatch(/private-header|private-body|ghp_private_token/u);
    }
  );

  it("records thrown mappings time and leaves unattempted phases null", async () => {
    vi.mocked(getAssignmentRepositoryMappings).mockImplementation(async () => {
      vi.advanceTimersByTime(MAPPINGS_MS);
      throw new Error("ghp_private_token private-body");
    });
    const result = await applyAssignmentWithStudentRepositoryAccessPage(request, options);
    expectTiming(result, false, false);
    expect(result.accessPageError?.code).toBe("student_repository_access_page_generation_failed");
    expect(generateStudentRepositoryAccessPage).not.toHaveBeenCalled();
    expect(publishStudentRepositoryAccessPage).not.toHaveBeenCalled();
  });

  it("records failed generation and leaves publication unattempted", async () => {
    const generate = vi.mocked(generateStudentRepositoryAccessPage).getMockImplementation()!;
    vi.mocked(generateStudentRepositoryAccessPage).mockImplementation(async (...args) => ({
      ...(await generate(...args)),
      status: "failure"
    }));
    const result = await applyAssignmentWithStudentRepositoryAccessPage(request, options);
    expectTiming(result, true, false);
    expect(result.accessPageError?.code).toBe("student_repository_access_page_generation_failed");
    expect(publishStudentRepositoryAccessPage).not.toHaveBeenCalled();
  });

  it("returns failed Apply unchanged without follow-up timing or work", async () => {
    const failure = { ...original, status: "failure" as const };
    vi.mocked(applyAssignment).mockResolvedValue(failure);
    expect(await applyAssignmentWithStudentRepositoryAccessPage(request, options)).toBe(failure);
    expect(getAssignmentRepositoryMappings).not.toHaveBeenCalled();
    expect(generateStudentRepositoryAccessPage).not.toHaveBeenCalled();
    expect(publishStudentRepositoryAccessPage).not.toHaveBeenCalled();
  });
});
