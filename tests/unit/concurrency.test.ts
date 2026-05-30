import { describe, expect, it } from "vitest";
import {
  DEFAULT_GITHUB_CONCURRENCY_LIMIT,
  runWithBoundedConcurrency
} from "../../src/core/concurrency.js";

enum ConcurrencyTestNumber {
  TaskCount = 5,
  CustomLimit = 2,
  Increment = 1,
  InitialCount = 0
}

describe("bounded concurrency helper", () => {
  it("preserves result ordering while limiting active tasks", async () => {
    let activeTaskCount = ConcurrencyTestNumber.InitialCount;
    let maxActiveTaskCount = ConcurrencyTestNumber.InitialCount;
    const tasks = Array.from(
      { length: ConcurrencyTestNumber.TaskCount },
      (_, index) => async () => {
        activeTaskCount += ConcurrencyTestNumber.Increment;
        maxActiveTaskCount = Math.max(maxActiveTaskCount, activeTaskCount);
        await Promise.resolve();
        activeTaskCount -= ConcurrencyTestNumber.Increment;

        return index;
      }
    );

    const results = await runWithBoundedConcurrency(tasks, ConcurrencyTestNumber.CustomLimit);

    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(maxActiveTaskCount).toBeLessThanOrEqual(ConcurrencyTestNumber.CustomLimit);
  });

  it("uses a conservative default concurrency limit", () => {
    expect(DEFAULT_GITHUB_CONCURRENCY_LIMIT).toBe(ConcurrencyTestNumber.CustomLimit);
  });
});
