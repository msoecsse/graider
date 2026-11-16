/** Main-only, allowlisted fields: never accept origins, errors, tokens or request objects. */
export const reportCourseSynchronization = (sample: {
  readonly stage: "cache" | "source" | "remote";
  readonly repositoryId: number;
  readonly organizationId: number;
  readonly source: "managed" | "registered";
  readonly expectedSha: string;
  readonly localSha?: string;
  readonly managedCacheSha: string;
}): void => {
  const sha = (value: string | undefined) =>
    value && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(value) ? value : null;
  console.info(
    "Graider course synchronization",
    JSON.stringify({
      stage: sample.stage,
      repositoryId: sample.repositoryId,
      organizationId: sample.organizationId,
      source: sample.source,
      expectedSha: sha(sample.expectedSha),
      localSha: sha(sample.localSha),
      managedCacheSha: sha(sample.managedCacheSha)
    })
  );
};
