// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRemoteRepositoryReader } from "./githubRemoteRepositories.js";
import type { GitHubClient } from "./githubClientProvider.js";
const signal = new AbortController().signal;
const rawRepo = (id: number) => ({
  id,
  node_id: `R_${id}`,
  owner: { id: 10, login: "org" },
  name: `repo-${id}`,
  default_branch: "main",
  archived: false,
  disabled: false,
  private: true,
  topics: []
});
const response = (data: unknown, status = 200, headers = {}) => ({
  data,
  status,
  headers: { "x-oauth-scopes": "read:org, repo", ...headers }
});
const fixture = () => {
  const client = {
    listCourseRepositoriesPage: vi.fn().mockResolvedValue(response([])),
    searchCourseMetadataPage: vi
      .fn()
      .mockResolvedValue(response({ items: [], total_count: 0, incomplete_results: false })),
    getCourseRepositoryById: vi.fn().mockResolvedValue(response(rawRepo(20))),
    getCourseRepository: vi.fn().mockResolvedValue(response(rawRepo(20))),
    getCourseMetadataPath: vi.fn(),
    getOrganizationScopeResponse: vi.fn().mockResolvedValue(response({})),
    createRepository: vi.fn(),
    writeRepositoryFile: vi.fn(),
    dispatchWorkflow: vi.fn()
  };
  return {
    client,
    reader: createRemoteRepositoryReader(
      "private-token",
      signal,
      () => client as unknown as GitHubClient
    )
  };
};
describe("GitHub remote repository read adapter", () => {
  it("resolves immutable ID without consulting old owner/name", async () => {
    const f = fixture();
    expect(await f.reader.resolveId(20)).toMatchObject({ id: 20, owner: "org" });
    expect(f.client.getCourseRepositoryById).toHaveBeenCalledWith(20, expect.any(AbortSignal));
    expect(f.client.getCourseRepository).not.toHaveBeenCalled();
    await expect(f.reader.resolveId(-1)).rejects.toThrow();
  });
  it("paginates the complete org inventory internally and deduplicates immutable IDs", async () => {
    const f = fixture();
    f.client.listCourseRepositoriesPage
      .mockResolvedValueOnce(
        response(Array.from({ length: 100 }, (_, index) => rawRepo(index + 1)))
      )
      .mockResolvedValueOnce(response([rawRepo(100), rawRepo(101)]));
    expect(await f.reader.list("org")).toHaveLength(101);
    expect(f.client.listCourseRepositoriesPage).toHaveBeenNthCalledWith(
      2,
      "org",
      2,
      100,
      expect.any(AbortSignal)
    );
    expect(f.client.getCourseMetadataPath).not.toHaveBeenCalled();
  });
  it("paginates search hints, selects only root course.yml and reports truncation", async () => {
    const f = fixture();
    f.client.searchCourseMetadataPage
      .mockResolvedValueOnce(
        response({
          items: Array.from({ length: 100 }, (_, index) => ({
            path: "course.yml",
            repository: { id: index + 1 }
          })),
          total_count: 101,
          incomplete_results: false
        })
      )
      .mockResolvedValueOnce(
        response({
          items: [{ path: "nested/course.yml", repository: { id: 101 } }],
          total_count: 101,
          incomplete_results: true
        })
      );
    const result = await f.reader.search("org");
    expect(result.ids).toHaveLength(100);
    expect(result.incomplete).toBe(true);
  });
  it.each([
    [429, {}, "rate_limited"],
    [403, { "x-github-sso": "required; url=private-token" }, "sso_required"],
    [403, { "x-oauth-scopes": "read:org" }, "insufficient_scope"],
    [404, {}, "repository_inaccessible"],
    [503, {}, "network_unavailable"]
  ])("sanitizes status %s as %s", async (status, headers, code) => {
    const f = fixture();
    f.client.listCourseRepositoriesPage.mockResolvedValue(
      response({ message: "private-token" }, status, headers)
    );
    await expect(f.reader.list("org")).rejects.toMatchObject({
      code,
      message: expect.not.stringContaining("private-token")
    });
  });
  it("keeps repository 401 scoped until /user confirms global invalidation", async () => {
    const f = fixture();
    f.client.listCourseRepositoriesPage.mockResolvedValue(response({}, 401));
    await expect(f.reader.list("org")).rejects.toMatchObject({ code: "repository_inaccessible" });
    f.client.getOrganizationScopeResponse.mockResolvedValue(response({}, 401));
    await expect(f.reader.list("org")).rejects.toMatchObject({ code: "invalid_credential" });
  });
  it("normalizes transport failure without leaking raw provider details", async () => {
    const f = fixture();
    f.client.listCourseRepositoriesPage.mockRejectedValue(new Error("private-token"));
    await expect(f.reader.list("org")).rejects.toMatchObject({
      code: "network_unavailable",
      message: expect.not.stringContaining("private-token")
    });
  });
  it("allows only metadata files, rejects symlinks and exposes no mutation", async () => {
    const f = fixture();
    const repo = (await f.reader.resolve("org", "repo-20"))!;
    await expect(f.reader.file(repo, "terms/27s1/rosters/001.csv")).rejects.toMatchObject({
      code: "error"
    });
    expect(f.client.getCourseMetadataPath).not.toHaveBeenCalled();
    f.client.getCourseMetadataPath.mockResolvedValue(
      response({ type: "symlink", path: "course.yml", encoding: "base64", content: "", size: 0 })
    );
    await expect(f.reader.file(repo, "course.yml")).rejects.toMatchObject({ code: "error" });
    f.client.getCourseMetadataPath.mockResolvedValue(
      response({
        type: "file",
        path: "course.yml",
        encoding: "base64",
        content: Buffer.from("hello").toString("base64"),
        size: 5
      })
    );
    expect(await f.reader.file(repo, "course.yml")).toBe("hello");
    expect(Object.keys(f.reader).sort()).toEqual([
      "file",
      "list",
      "resolve",
      "resolveId",
      "search",
      "terms"
    ]);
    expect(f.client.createRepository).not.toHaveBeenCalled();
    expect(f.client.writeRepositoryFile).not.toHaveBeenCalled();
    expect(f.client.dispatchWorkflow).not.toHaveBeenCalled();
  });
});

describe("valid repository names in a large organization inventory", () => {
  it("does not discard an organization because it contains a .github or _starter repository", async () => {
    const f = fixture();
    f.client.listCourseRepositoriesPage.mockResolvedValue(
      response([
        { ...rawRepo(20), name: ".github" },
        { ...rawRepo(21), name: "_starter" }
      ])
    );
    expect((await f.reader.list("org")).map((repo) => repo.name)).toEqual([".github", "_starter"]);
  });
});
