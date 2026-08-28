import { describe, expect, it, vi } from "vitest";
import { validateTemplateRepository } from "./templateRepositoryValidationService";

const runner = vi.fn();
const successToken = async () => ({ status: "success" as const, token: "secret-token" });
const response = (ok: boolean, status: number, value: unknown = {}) => ({
  ok,
  status,
  json: async () => value
});

describe("templateRepositoryValidationService", () => {
  it("normalizes GitHub URLs and validates the repository and branch read-only", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { default_branch: "main" }))
      .mockResolvedValueOnce(response(true, 200));
    const result = await validateTemplateRepository(
      "https://github.com/csc1120/template.git",
      "main",
      {
        runner,
        resolveToken: successToken,
        fetchImplementation
      }
    );
    expect(result).toMatchObject({ valid: true, repository: "csc1120/template", branch: "main" });
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("resolves the repository default branch when branch input is blank", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { default_branch: "master" }))
      .mockResolvedValueOnce(response(true, 200));
    const result = await validateTemplateRepository("owner/repo", "", {
      runner,
      resolveToken: successToken,
      fetchImplementation
    });
    expect(result).toMatchObject({ valid: true, branch: "master" });
    expect(result.diagnostics[0]?.message).toContain("Using default branch: master");
  });

  it("blocks invalid repositories, authentication failures, inaccessible repositories, and missing branches", async () => {
    const fetchImplementation = vi.fn();
    expect(
      (
        await validateTemplateRepository("not valid", "main", {
          runner,
          fetchImplementation,
          resolveToken: successToken
        })
      ).valid
    ).toBe(false);
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(
      (
        await validateTemplateRepository("owner/repo", "main", {
          runner,
          fetchImplementation,
          resolveToken: async () => ({ status: "failure" as const, error: {} as never })
        })
      ).diagnostics[0]?.message
    ).toContain("authentication");
    expect(
      (
        await validateTemplateRepository("owner/repo", "main", {
          runner,
          resolveToken: successToken,
          fetchImplementation: vi.fn().mockResolvedValue(response(false, 404))
        })
      ).diagnostics[0]?.message
    ).toContain("not found or is not accessible");
    expect(
      (
        await validateTemplateRepository("owner/repo", "main", {
          runner,
          resolveToken: successToken,
          fetchImplementation: vi
            .fn()
            .mockResolvedValueOnce(response(true, 200, { default_branch: "main" }))
            .mockResolvedValueOnce(response(false, 404))
        })
      ).diagnostics[0]?.message
    ).toContain("branch main was not found");
  });
});
