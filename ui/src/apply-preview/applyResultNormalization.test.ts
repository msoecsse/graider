import { describe, expect, it } from "vitest";
import type { AssignmentApplyJsonResponse } from "../../electron/ipc";
import { normalizeApplyResult } from "./applyResultNormalization";

describe("normalizeApplyResult", () => {
  it("counts one created repository once when Apply performs multiple follow-up mutations", () => {
    const apply = {
      schemaVersion: 1,
      commandName: "assignment apply",
      assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
      status: "success",
      exitCode: 0,
      diagnostics: [],
      warnings: [],
      errors: [],
      generatedFiles: [],
      summary: {
        created: 1,
        updated: 4,
        skipped: 0,
        failed: 0,
        blocked: 0,
        repositories: [
          {
            studentId: "s001",
            githubUsername: "ada",
            section: "001",
            repository: "graider-sandbox/csc1120-lab02-ada",
            status: "created"
          }
        ]
      }
    } as AssignmentApplyJsonResponse;

    expect(normalizeApplyResult(apply, "2026-09-03T00:00:00.000Z").summary).toEqual({
      createdRepositories: 1,
      updatedRepositories: 0,
      skippedRepositories: 0,
      failedRepositories: 0,
      blockedRepositories: 0
    });
  });
});
