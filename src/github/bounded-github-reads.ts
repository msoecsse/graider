/** Small read-only batches bound pressure and retain input order regardless of completion order. */
export const GITHUB_READ_CONCURRENCY = 4;

export const mapGitHubReads = async <T, R>(
  values: readonly T[],
  read: (value: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  for (let offset = 0; offset < values.length; offset += GITHUB_READ_CONCURRENCY) {
    results.push(
      ...(await Promise.all(values.slice(offset, offset + GITHUB_READ_CONCURRENCY).map(read)))
    );
  }
  return results;
};
