import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GITHUB_READ_CONCURRENCY,
  mapGitHubReads
} from "../../../src/github/bounded-github-reads.js";

const STUDENTS = 30;
const LATENCY_MS = 100;
afterEach(() => {
  vi.useRealTimers();
});

describe("bounded GitHub planning reads", () => {
  it("preserves roster order with out-of-order responses and four active requests at most", async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const students = Array.from({ length: STUDENTS }, (_, index) => index);
    const pending = mapGitHubReads(students, async (student) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          (GITHUB_READ_CONCURRENCY - (student % GITHUB_READ_CONCURRENCY)) * LATENCY_MS
        )
      );
      active -= 1;
      return student;
    });
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(students);
    expect(peak).toBe(GITHUB_READ_CONCURRENCY);
    expect(active).toBe(0);
  });

  it("measures the concurrency benefit independently of request elimination", async () => {
    vi.useFakeTimers();
    const students = Array.from({ length: STUDENTS }, (_, index) => index);
    const read = async (student: number) => {
      await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
      return student;
    };
    const sequential = async () => {
      const results: number[] = [];
      for (const student of students) results.push(await read(student));
      return results;
    };
    const start = Date.now();
    const serial = sequential();
    await vi.runAllTimersAsync();
    expect(await serial).toEqual(students);
    const serialMs = Date.now() - start;
    const boundedStart = Date.now();
    const bounded = mapGitHubReads(students, read);
    await vi.runAllTimersAsync();
    expect(await bounded).toEqual(students);
    expect(serialMs).toBe(STUDENTS * LATENCY_MS);
    expect(Date.now() - boundedStart).toBe(
      Math.ceil(STUDENTS / GITHUB_READ_CONCURRENCY) * LATENCY_MS
    );
  });
});
