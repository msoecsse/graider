import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

type Phase =
  | "bootstrap"
  | "authorization_cache_hit"
  | "credential_restore"
  | "account_verification"
  | "cached_courses"
  | "organization_discovery"
  | "repository_listing"
  | "metadata_search"
  | "synchronization"
  | "fetch"
  | "remote_authorization"
  | "cache_validation"
  | "lock_wait"
  | "student_head"
  | "service"
  | "backend"
  | "faculty_scope"
  | "local_git_validation"
  | "committed_metadata"
  | "remote_request"
  | "student_evidence";
export interface GradingPerformanceSample {
  readonly channel: string;
  source?: "managed" | "legacy";
  operation?:
    | "local_read"
    | "local_grading"
    | "evidence_read"
    | "synchronized"
    | "source_authorization";
  authorization?: "restoring" | "discovering" | "unrecognized" | "source_required" | "signed_out";
  readonly durationMs: number;
  readonly phases: Partial<Record<Phase, { count: number; durationMs: number }>>;
}
const measurements = new AsyncLocalStorage<GradingPerformanceSample>();
const record = (phase: Phase, started: number) => {
  const phases = measurements.getStore()?.phases;
  if (phases) {
    const entry = (phases[phase] ??= { count: 0, durationMs: 0 });
    entry.count++;
    entry.durationMs += performance.now() - started;
  }
};
export const classifyGradingOperation = (
  classification: Pick<GradingPerformanceSample, "source" | "operation" | "authorization">
): void => {
  const sample = measurements.getStore();
  if (sample) Object.assign(sample, classification);
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
  if (
    !report &&
    (measurements.getStore() ||
      (process.env.GRAIDER_GRADING_PERFORMANCE !== "1" &&
        process.env.GRAIDER_STARTUP_PERFORMANCE !== "1"))
  )
    return operation();
  const sample: GradingPerformanceSample = { channel, durationMs: 0, phases: {} };
  const started = performance.now();
  try {
    return await measurements.run(sample, operation);
  } finally {
    const completed = { ...sample, durationMs: performance.now() - started };
    if (report) report(completed);
    else console.info("Graider grading performance", JSON.stringify(completed));
  }
};

/** Opt-in startup timeline; aggregate durations/counts only, never identities or errors. */
export const measureStartup = <T>(channel: string, operation: () => Promise<T>): Promise<T> =>
  process.env.GRAIDER_STARTUP_PERFORMANCE === "1"
    ? measureGradingOperation(channel, operation, (sample) =>
        console.info("Graider startup performance", JSON.stringify(sample))
      )
    : operation();
