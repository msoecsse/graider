// @vitest-environment node
import { expect, it, vi } from "vitest";
import { reportCourseSynchronization } from "./courseSynchronizationDiagnostics";

it("logs only repository identity, source selection and exact SHAs", () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const commit = "a".repeat(40);
  const sample = {
    stage: "source" as const,
    repositoryId: 20,
    organizationId: 10,
    source: "registered" as const,
    expectedSha: commit,
    localSha: "Bearer secret-token",
    managedCacheSha: commit,
    token: "secret-token",
    origin: "https://secret-token@github.com/fixture/course",
    headers: { authorization: "Bearer secret-token" }
  };
  reportCourseSynchronization(sample);
  expect(log).toHaveBeenCalledExactlyOnceWith(
    "Graider course synchronization",
    JSON.stringify({
      stage: "source",
      repositoryId: 20,
      organizationId: 10,
      source: "registered",
      expectedSha: commit,
      localSha: null,
      managedCacheSha: commit
    })
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token");
});
