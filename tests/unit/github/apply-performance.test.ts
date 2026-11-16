import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApplyPerformance,
  measureApplyPhase,
  withApplyPerformance
} from "../../../src/github/apply-performance.js";
import { OctokitGitHubClient } from "../../../src/github/octokit-github-client.js";
import { withGitHubRetry } from "../../../src/github/github-retry.js";
import { createApplyReadClient } from "../../../src/github/apply-read-client.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";

const TOKEN = "ghp_diagnostic_test_secret";
const NOT_FOUND = 404;
const FORBIDDEN = 403;
const UNAUTHORIZED = 401;
const RATE_LIMITED = 429;
const OK = 200;
const RETRY_WAIT_MS = 1_000;
const client = () => new OctokitGitHubClient({ token: TOKEN });
const response = (status: number): Response =>
  new Response(JSON.stringify({ message: "Request failed" }), {
    status,
    headers: { "content-type": "application/json", "retry-after": "1" }
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Apply HTTP diagnostics", () => {
  it("separates concurrent nullable 404s from required reads and failed writes without console errors", async () => {
    const errors = vi.spyOn(console, "error");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(NOT_FOUND)))
    );
    const github = client();
    const collector = new ApplyPerformance();
    await collector.run(() =>
      Promise.all([
        measureApplyPhase("verification", async () => {
          expect(await github.getWorkflow("org", "repo", "grade.yml")).toBeNull();
        }),
        measureApplyPhase("actionsConfiguration", async () => {
          await expect(github.getActionsState("org", "repo")).rejects.toMatchObject({
            statusCode: NOT_FOUND
          });
        }),
        measureApplyPhase("repositoryCreation", async () => {
          await expect(
            github.createRepository({ owner: "org", name: "repo", private: true })
          ).rejects.toMatchObject({ statusCode: NOT_FOUND });
        })
      ])
    );
    const { phases } = collector.snapshot();
    expect(phases.verification).toMatchObject({
      httpRequests: 1,
      httpReadRequests: 1,
      expectedMissingResponses: 1,
      failedResponses: 0
    });
    expect(phases.actionsConfiguration).toMatchObject({
      httpRequests: 1,
      expectedMissingResponses: 0,
      failedResponses: 1
    });
    expect(phases.repositoryCreation).toMatchObject({
      httpRequests: 1,
      httpWriteRequests: 1,
      expectedMissingResponses: 0,
      failedResponses: 1
    });
    expect(errors).not.toHaveBeenCalled();
    expect(JSON.stringify(collector.snapshot())).not.toContain(TOKEN);
  });

  it.each([UNAUTHORIZED, FORBIDDEN, RATE_LIMITED])(
    "retains meaningful failure %s on nullable reads",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(response(status)))
      );
      const github = client();
      const collector = new ApplyPerformance();
      await collector.run(() =>
        measureApplyPhase("planning", async () => {
          await expect(github.getRepository("org", "repo")).rejects.toMatchObject({
            statusCode: status
          });
        })
      );
      expect(collector.snapshot().phases.planning).toMatchObject({
        httpRequests: 1,
        expectedMissingResponses: 0,
        failedResponses: 1
      });
    }
  );

  it("counts rate-limit retries, respects Retry-After and never memoizes authorization", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(response(RATE_LIMITED))
      .mockResolvedValueOnce(response(OK))
      .mockResolvedValueOnce(response(OK));
    vi.stubGlobal("fetch", transport);
    const sleep = vi.fn(() => Promise.resolve());
    const github = createApplyReadClient(client());
    const collector = new ApplyPerformance();
    await collector.run(() =>
      measureApplyPhase("readiness", async () => {
        await withGitHubRetry(() => github.getAuthenticatedUser(), { sleep });
        await github.getAuthenticatedUser();
      })
    );
    expect(sleep).toHaveBeenCalledExactlyOnceWith(RETRY_WAIT_MS);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(collector.snapshot().phases.readiness).toMatchObject({
      httpRequests: 3,
      failedResponses: 1,
      expectedMissingResponses: 0
    });
  });

  it("isolates overlapping Apply collectors and includes transport failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error(TOKEN)))
    );
    const github = client();
    const first = new ApplyPerformance();
    const second = new ApplyPerformance();
    await Promise.all(
      [first, second].map((collector) =>
        collector.run(() =>
          measureApplyPhase("planning", async () => {
            await expect(github.getRepository("org", "repo")).rejects.toThrow();
          })
        )
      )
    );
    for (const collector of [first, second]) {
      expect(collector.snapshot().phases.planning).toMatchObject({
        httpRequests: 1,
        networkFailures: 1,
        failedResponses: 0
      });
      expect(JSON.stringify(collector.snapshot())).not.toContain(TOKEN);
    }
  });

  it("shares measurements across nested adapters and attributes group operations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(OK)))
    );
    const github = createApplyReadClient(client());
    const result = await withApplyPerformance(() =>
      withApplyPerformance(async () => {
        await github.getRepository("org", "repo");
        await github.getActionsState("org", "repo");
        return { summary: {} };
      })
    );
    expect(result.summary).toMatchObject({
      githubPerformance: {
        phases: {
          repositoryCreation: { httpRequests: 1 },
          actionsConfiguration: { httpRequests: 1 }
        }
      }
    });
  });

  it("reuses templates only in one Apply and evicts failed reads", async () => {
    const original = new FakeGitHubClient();
    const read = vi
      .spyOn(original, "getTemplateRepository")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(null);
    const first = createApplyReadClient(original);
    await expect(first.getTemplateRepository("org", "template")).rejects.toThrow("offline");
    await first.getTemplateRepository("org", "template");
    await first.getTemplateRepository("org", "template");
    expect(read).toHaveBeenCalledTimes(2);
    await createApplyReadClient(original).getTemplateRepository("org", "template");
    expect(read).toHaveBeenCalledTimes(3);
  });
});
