import { describe, expect, it, vi } from "vitest";
import {
  OctokitGitHubClient,
  type OctokitRestClientLike
} from "../../../src/github/octokit-github-client.js";

const SHA_LENGTH = 40;
const SHA = "a".repeat(SHA_LENGTH);
describe("migration exact-object GitHub transport", () => {
  it("issues only bounded GETs for exact trees/blobs", async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} });
    const client = new OctokitGitHubClient({
      token: "test-token",
      octokit: { request } as unknown as OctokitRestClientLike
    });
    const signal = new AbortController().signal;
    await client.getMigrationCommit("org", "course", SHA, signal);
    await client.getMigrationTree("org", "course", SHA, signal);
    await client.getMigrationBlob("org", "course", SHA, signal);
    expect(request.mock.calls.map(([value]: readonly unknown[]) => value)).toEqual([
      {
        method: "GET",
        url: "/repos/{owner}/{repo}/git/commits/{commit_sha}",
        owner: "org",
        repo: "course",
        commit_sha: SHA,
        request: { signal, redirect: "error" }
      },
      {
        method: "GET",
        url: "/repos/{owner}/{repo}/git/trees/{tree_sha}",
        owner: "org",
        repo: "course",
        tree_sha: SHA,
        recursive: "1",
        request: { signal, redirect: "error" }
      },
      {
        method: "GET",
        url: "/repos/{owner}/{repo}/git/blobs/{file_sha}",
        owner: "org",
        repo: "course",
        file_sha: SHA,
        request: { signal, redirect: "error" }
      }
    ]);
  });
  it("rejects symbolic revisions before transport", async () => {
    const request = vi.fn();
    const client = new OctokitGitHubClient({
      token: "test-token",
      octokit: { request } as unknown as OctokitRestClientLike
    });
    await expect(
      client.getMigrationTree("org", "course", "main", new AbortController().signal)
    ).rejects.toThrow();
    await expect(
      client.getMigrationBlob("org", "course", "HEAD", new AbortController().signal)
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
