import { describe, expect, it } from "vitest";
import { generateRepositoryName, validateRepositoryName } from "../../src/planning/repo-name.js";

const PATTERN = "{term}-{course}-{assignment}-{github_username}";
const LEGACY_PATTERN = "{term}-{course}-{assignment}-{student}";

const createInput = (overrides: Partial<Parameters<typeof generateRepositoryName>[0]> = {}) => ({
  pattern: PATTERN,
  termCode: "27s1",
  courseCode: "se2030",
  assignmentSlug: "lab04",
  githubUsername: "seanjones",
  ...overrides
});

describe("repository name generation", () => {
  it("TC-REPO-NAME-001 generates 27s1-se2030-lab04-seanjones", () => {
    const result = generateRepositoryName(createInput());

    expect(result).toMatchObject({
      repositoryName: "27s1-se2030-lab04-seanjones",
      warnings: [],
      errors: []
    });
  });

  it("TC-REPO-NAME-002 normalizes uppercase username before repo naming", () => {
    const result = generateRepositoryName(
      createInput({
        termCode: "27S1",
        courseCode: "SE2030",
        assignmentSlug: "LAB04",
        githubUsername: "SeanJones"
      })
    );

    expect(result.repositoryName).toBe("27s1-se2030-lab04-seanjones");
  });

  it("TC-REPO-NAME-003 invalid generated repo name fails", () => {
    const result = generateRepositoryName(createInput({ githubUsername: "sean/jones" }));

    expect(result.repositoryName).toBeUndefined();
    expect(result.errors).toEqual([expect.objectContaining({ code: "invalid_repository_name" })]);
  });

  it("TC-REPO-NAME-004 repo names are deterministic", () => {
    const firstResult = generateRepositoryName(createInput());
    const secondResult = generateRepositoryName(createInput());

    expect(firstResult).toEqual(secondResult);
  });

  it("supports the current legacy student placeholder convention", () => {
    const result = generateRepositoryName(createInput({ pattern: LEGACY_PATTERN }));

    expect(result.repositoryName).toBe("27s1-se2030-lab04-seanjones");
  });

  it("unknown pattern placeholder returns diagnostic", () => {
    const result = generateRepositoryName(createInput({ pattern: "{term}-{unknown}" }));

    expect(result.repositoryName).toBeUndefined();
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "repo_name_pattern_unknown_placeholder" })
    );
  });

  it("missing required placeholder returns diagnostic", () => {
    const result = generateRepositoryName(createInput({ pattern: "{term}-{course}-{assignment}" }));

    expect(result.repositoryName).toBeUndefined();
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "repo_name_pattern_missing_placeholder" })
    ]);
  });

  it("repository name with spaces fails", () => {
    expect(validateRepositoryName("bad repo").errors).toEqual([
      expect.objectContaining({ code: "invalid_repository_name" })
    ]);
  });

  it("repository name with slash fails", () => {
    expect(validateRepositoryName("bad/repo").errors).toEqual([
      expect.objectContaining({ code: "invalid_repository_name" })
    ]);
  });

  it("repository name with leading hyphen fails", () => {
    expect(validateRepositoryName("-badrepo").errors).toEqual([
      expect.objectContaining({ code: "invalid_repository_name" })
    ]);
  });

  it("repository name with trailing hyphen fails", () => {
    expect(validateRepositoryName("badrepo-").errors).toEqual([
      expect.objectContaining({ code: "invalid_repository_name" })
    ]);
  });

  it("repository name with consecutive hyphens fails", () => {
    expect(validateRepositoryName("bad--repo").errors).toEqual([
      expect.objectContaining({ code: "invalid_repository_name" })
    ]);
  });
});
