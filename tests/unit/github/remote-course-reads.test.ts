import { describe, expect, it, vi } from "vitest";
import {
  OctokitGitHubClient,
  type OctokitRestClientLike
} from "../../../src/github/octokit-github-client.js";
const OK = 200;
const MOVED = 301;
const PAGE_SIZE = 100;
const COURSE_REPOSITORY_ID = 1342086585;
const fixture = () => {
  const response = { status: OK, headers: {}, data: {} };
  const request = vi.fn().mockResolvedValue(response);
  const client = new OctokitGitHubClient({
    token: "fake_oauth_token",
    octokit: { request } as unknown as OctokitRestClientLike
  });
  return { request, client, response, signal: new AbortController().signal };
};
describe("remote course host read-only boundary", () => {
  it("resolves canonical repository identity directly with a cancellable GET", async () => {
    const f = fixture();
    expect(await f.client.getCourseRepositoryById(COURSE_REPOSITORY_ID, f.signal)).toEqual(
      f.response
    );
    expect(f.request).toHaveBeenCalledExactlyOnceWith({
      method: "GET",
      url: `/repositories/${String(COURSE_REPOSITORY_ID)}`,
      request: { signal: f.signal, redirect: "error" }
    });
  });
  it("uses only GET routes, exact metadata paths, OAuth transport and bounded cancellation", async () => {
    const f = fixture();
    await f.client.listCourseRepositoriesPage("course-org", 1, PAGE_SIZE, f.signal);
    await f.client.searchCourseMetadataPage("course-org", 1, PAGE_SIZE, f.signal);
    await f.client.getCourseRepository("course-org", "admin", f.signal);
    await f.client.getCourseMetadataPath("course-org", "admin", "course.yml", "main", f.signal);
    await f.client.getCourseMetadataPath("course-org", "admin", "terms", "main", f.signal);
    await f.client.getCourseMetadataPath(
      "course-org",
      "admin",
      "terms/27s1/term.yml",
      "main",
      f.signal
    );
    for (const [input] of f.request.mock.calls as readonly (readonly {
      method: string;
      request: { signal: AbortSignal; redirect: string };
    }[])[]) {
      expect(input?.method).toBe("GET");
      expect(input?.request).toEqual({ signal: f.signal, redirect: "error" });
    }
    expect(f.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/search/code",
        q: "org:course-org filename:course.yml path:/"
      })
    );
  });
  it.each([
    "terms/27s1/rosters/001.csv",
    "terms/27s1/assignments/lab/assignment.yml",
    "../course.yml",
    ".graider/grading/state.json"
  ])("refuses unrelated metadata path %s", async (path) => {
    const f = fixture();
    await expect(
      f.client.getCourseMetadataPath("org", "repo", path, "main", f.signal)
    ).rejects.toThrow("Only course and term metadata paths are permitted.");
    expect(f.request).not.toHaveBeenCalled();
  });
  it("resolves a rename only via GitHub's immutable repository route", async () => {
    const f = fixture();
    f.request.mockResolvedValueOnce({
      status: MOVED,
      headers: { location: "https://api.github.com/repositories/123" },
      data: {}
    });
    expect(await f.client.getCourseRepository("org", "old", f.signal)).toEqual(f.response);
    expect(f.request).toHaveBeenLastCalledWith({
      method: "GET",
      url: "/repositories/123",
      request: { signal: f.signal, redirect: "error" }
    });
  });
  it.each([
    "https://evil.example/repositories/123",
    "https://api.github.com/repos/other/private",
    "https://api.github.com/repositories/123?token=secret"
  ])("never follows an arbitrary redirect %s", async (location) => {
    const f = fixture();
    f.request.mockResolvedValueOnce({ status: MOVED, headers: { location }, data: {} });
    expect((await f.client.getCourseRepository("org", "old", f.signal)).status).toBe(MOVED);
    expect(f.request).toHaveBeenCalledTimes(1);
  });
});
