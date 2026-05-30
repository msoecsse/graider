export const DEFAULT_GITHUB_CONCURRENCY_LIMIT = 2;

const MIN_CONCURRENCY_LIMIT = 1;
const EMPTY_TASK_COUNT = 0;

export type ConcurrentTask<T> = () => Promise<T>;

export async function runWithBoundedConcurrency<T>(
  tasks: readonly ConcurrentTask<T>[],
  concurrencyLimit = DEFAULT_GITHUB_CONCURRENCY_LIMIT
): Promise<T[]> {
  const effectiveLimit = Math.max(MIN_CONCURRENCY_LIMIT, concurrencyLimit);
  const workerCount = Math.min(effectiveLimit, tasks.length);
  const results = new Array<T>(tasks.length);
  let nextTaskIndex = 0;

  if (tasks.length === EMPTY_TASK_COUNT) {
    return results;
  }

  const runWorker = async (): Promise<void> => {
    for (let hasTask = true; hasTask; ) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += MIN_CONCURRENCY_LIMIT;
      const task = tasks[taskIndex];

      if (task === undefined) {
        hasTask = false;
      } else {
        results[taskIndex] = await task();
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return results;
}
