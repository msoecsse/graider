import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

type Phase =
  | "synchronization"
  | "fetch"
  | "remote_authorization"
  | "cache_validation"
  | "lock_wait"
  | "student_head"
  | "service"
  | "backend";
export interface GradingPerformanceSample {
  readonly channel: string;
  readonly durationMs: number;
  readonly phases: Partial<Record<Phase, { count: number; durationMs: number }>>;
}
const measurements = new AsyncLocalStorage<GradingPerformanceSample["phases"]>();
const record = (phase: Phase, started: number) => {
  const phases = measurements.getStore();
  if (phases) {
    const entry = (phases[phase] ??= { count: 0, durationMs: 0 });
    entry.count++;
    entry.durationMs += performance.now() - started;
  }
};
export const measureGradingPhase = async <T>(phase: Phase, operation: () => Promise<T>) => {
  const started = performance.now();
  try {
    return await operation();
  } finally {
    record(phase, started);
  }
};
export const measureGradingPhaseSync = <T>(phase: Phase, operation: () => T): T => {
  const started = performance.now();
  try {
    return operation();
  } finally {
    record(phase, started);
  }
};
/** These grading backend contexts execute synchronously, including each atomic state update. */
export const measureGradingBackend = <T extends object>(backend: T): T =>
  new Proxy(backend, {
    get(target, key) {
      const method: unknown = Reflect.get(target, key);
      return typeof method === "function"
        ? (...args: unknown[]) =>
            measureGradingPhaseSync("backend", () => Reflect.apply(method, target, args))
        : method;
    }
  });
/** Opt-in, aggregate-only diagnostics: no arguments, identities, paths, results or errors. */
export const measureGradingOperation = async <T>(
  channel: string,
  operation: () => Promise<T>,
  report?: (sample: GradingPerformanceSample) => void
): Promise<T> => {
  if (!report && process.env.GRAIDER_GRADING_PERFORMANCE !== "1") return operation();
  const phases: GradingPerformanceSample["phases"] = {};
  const started = performance.now();
  try {
    return await measurements.run(phases, operation);
  } finally {
    const sample = { channel, durationMs: performance.now() - started, phases };
    if (report) report(sample);
    else console.info("Graider grading performance", JSON.stringify(sample));
  }
};
