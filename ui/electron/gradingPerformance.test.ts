// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  measureGradingOperation,
  classifyGradingOperation,
  measureGradingPhase,
  measureGradingBackend,
  type GradingPerformanceSample
} from "./gradingPerformance";

afterEach(() => {
  vi.unstubAllEnvs();
});
it("keeps diagnostics opt-in and reports only aggregate timings on success or failure", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("GRAIDER_GRADING_PERFORMANCE", "0");
  await measureGradingOperation("test-channel", async () => "sensitive student content");
  expect(log).not.toHaveBeenCalled();
  vi.stubEnv("GRAIDER_GRADING_PERFORMANCE", "1");
  await expect(
    measureGradingOperation("test-channel", async () => {
      classifyGradingOperation({ source: "legacy", operation: "local_grading" });
      await measureGradingPhase("student_head", async () => "private-path");
      return measureGradingBackend({
        write: () => {
          throw new Error("private-token private-student");
        }
      }).write();
    })
  ).rejects.toThrow("private-token");
  expect(log).toHaveBeenCalledOnce();
  const sample = JSON.parse(log.mock.calls[0][1] as string) as GradingPerformanceSample;
  expect(sample).toMatchObject({
    channel: "test-channel",
    source: "legacy",
    operation: "local_grading",
    phases: { student_head: { count: 1 }, backend: { count: 1 } }
  });
  expect(sample.durationMs).toBeGreaterThanOrEqual(0);
  expect(Object.keys(sample).sort()).toEqual([
    "channel",
    "durationMs",
    "operation",
    "phases",
    "source"
  ]);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|sensitive/);
});
