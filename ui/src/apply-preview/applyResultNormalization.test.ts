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

  it.each([
    ["created", "repository_created", 1, 0, 0],
    ["updated", "repository_updated_with_issues", 0, 1, 0],
    ["failed", "repository_apply_failed", 0, 0, 1]
  ] as const)(
    "normalizes a %s row with its reason and diagnostics",
    (status, reason, created, updated, failed) => {
      const apply = {
        schemaVersion: 1,
        commandName: "assignment apply",
        assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
        status: "partial_success",
        exitCode: 4,
        diagnostics: [],
        warnings: [],
        errors: [],
        generatedFiles: [],
        summary: {
          repositories: [
            {
              studentId: "s001",
              githubUsername: "ada",
              section: "001",
              repository: "org/repo-ada",
              status,
              reason,
              diagnostics: [
                {
                  code: "github_api_error",
                  severity: "error",
                  message: "GitHub API request failed (HTTP 404: Not Found).",
                  context: { operationType: "enable_actions", statusCode: 404 }
                }
              ]
            }
          ]
        }
      } as AssignmentApplyJsonResponse;
      const normalized = normalizeApplyResult(apply, null);

      expect(normalized.rows[0]).toMatchObject({ status, reason });
      expect(normalized.rows[0]?.diagnostics[0]).toMatchObject({
        code: "github_api_error",
        context: { operationType: "enable_actions", statusCode: "404" }
      });
      expect(normalized.summary).toMatchObject({
        createdRepositories: created,
        updatedRepositories: updated,
        failedRepositories: failed
      });
    }
  );

  it("keeps older rows parseable and derives a known reason when new fields are absent", () => {
    const apply = {
      schemaVersion: 1,
      commandName: "assignment apply",
      assignmentFile: "assignment.yml",
      status: "success",
      exitCode: 0,
      diagnostics: [],
      warnings: [],
      errors: [],
      generatedFiles: [],
      summary: { repositories: [{ repository: "org/repo", status: "created" }] }
    } as AssignmentApplyJsonResponse;

    expect(normalizeApplyResult(apply, null).rows[0]).toMatchObject({
      status: "created",
      reason: "repository_created",
      diagnostics: []
    });
  });

  it("uses a safe failed fallback for an unknown row status", () => {
    const apply = {
      schemaVersion: 1,
      commandName: "assignment apply",
      assignmentFile: "assignment.yml",
      status: "failure",
      exitCode: 1,
      diagnostics: [],
      warnings: [],
      errors: [],
      generatedFiles: [],
      summary: { repositories: [{ status: "future_status" }] }
    } as AssignmentApplyJsonResponse;

    expect(normalizeApplyResult(apply, null).rows[0]).toMatchObject({
      status: "failed",
      reason: "repository_apply_failed"
    });
  });
});
