import { AsyncLocalStorage } from "node:async_hooks";

export const APPLY_PHASES = [
  "readiness",
  "planning",
  "repositoryCreation",
  "permissions",
  "actionsConfiguration",
  "workflowDeployment",
  "verification"
] as const;
export type ApplyPhase = (typeof APPLY_PHASES)[number];

interface PhaseMeasurements {
  elapsedMs: number;
  httpRequests: number;
  httpReadRequests: number;
  httpWriteRequests: number;
  expectedMissingResponses: number;
  failedResponses: number;
  networkFailures: number;
  requestElapsedMs: number;
}

const emptyMeasurements = (): PhaseMeasurements => ({
  elapsedMs: 0,
  httpRequests: 0,
  httpReadRequests: 0,
  httpWriteRequests: 0,
  expectedMissingResponses: 0,
  failedResponses: 0,
  networkFailures: 0,
  requestElapsedMs: 0
});
const operationContext = new AsyncLocalStorage<ApplyPerformance>();
const phaseContext = new AsyncLocalStorage<ApplyPhase>();
const authorityContext = new AsyncLocalStorage<ApplyPerformance>();
const nullableContext = new AsyncLocalStorage<boolean>();
const HTTP_NOT_FOUND = 404;
const HTTP_ERROR_START = 400;

/** Aggregate numbers only. Never accept URLs, headers, bodies, identities or exceptions. */
export class ApplyPerformance {
  private readonly phases = Object.fromEntries(
    APPLY_PHASES.map((phase) => [phase, emptyMeasurements()])
  ) as Record<ApplyPhase, PhaseMeasurements>;
  private readonly authorityValidation = emptyMeasurements();
  private readonly startedAt = performance.now();

  run<T>(operation: () => Promise<T>): Promise<T> {
    return operationContext.run(this, operation);
  }

  async measure<T>(phase: ApplyPhase, operation: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await phaseContext.run(phase, operation);
    } finally {
      this.phases[phase].elapsedMs += performance.now() - startedAt;
    }
  }

  async measureAuthorityValidation<T>(operation: () => Promise<T>): Promise<T> {
    if (authorityContext.getStore() === this) return operation();
    const startedAt = performance.now();
    try {
      return await authorityContext.run(this, operation);
    } finally {
      this.authorityValidation.elapsedMs += performance.now() - startedAt;
    }
  }

  recordRequest(
    phase: ApplyPhase | undefined,
    read: boolean,
    elapsedMs: number,
    status?: number
  ): void {
    const measurements = phase === undefined ? [] : [this.phases[phase]];
    if (authorityContext.getStore() === this) measurements.push(this.authorityValidation);
    for (const measurement of measurements) {
      measurement.httpRequests += 1;
      measurement.httpReadRequests += read ? 1 : 0;
      measurement.httpWriteRequests += read ? 0 : 1;
      measurement.requestElapsedMs += elapsedMs;
      if (status === undefined) measurement.networkFailures += 1;
      else if (status === HTTP_NOT_FOUND && nullableContext.getStore() === true)
        measurement.expectedMissingResponses += 1;
      else if (status >= HTTP_ERROR_START) measurement.failedResponses += 1;
    }
  }

  snapshot(): {
    elapsedMs: number;
    phases: Record<ApplyPhase, PhaseMeasurements>;
    authorityValidation: PhaseMeasurements;
  } {
    return {
      elapsedMs: performance.now() - this.startedAt,
      phases: structuredClone(this.phases),
      authorityValidation: structuredClone(this.authorityValidation)
    };
  }
}

export const measureApplyPhase = <T>(phase: ApplyPhase, operation: () => Promise<T>): Promise<T> =>
  phaseContext.getStore() === undefined
    ? (operationContext.getStore()?.measure(phase, operation) ?? operation())
    : operation();

/** Inclusive subtotal: existing phases still include their fresh authority checks. */
export const measureApplyAuthorityValidation = <T>(operation: () => Promise<T>): Promise<T> =>
  operationContext.getStore()?.measureAuthorityValidation(operation) ?? operation();

export const withNullableGitHubRead = <T>(operation: () => Promise<T>): Promise<T> =>
  nullableContext.run(true, operation);

/** Each transport attempt, including pagination and retries, is counted exactly once. */
export const measureApplyHttpRequest = async <T extends { status: number }>(
  read: boolean,
  operation: () => Promise<T>
): Promise<T> => {
  const collector = operationContext.getStore();
  const phase = phaseContext.getStore();
  if (collector === undefined || (phase === undefined && authorityContext.getStore() !== collector))
    return operation();
  const startedAt = performance.now();
  let status: number | undefined;
  try {
    const response = await operation();
    status = response.status;
    return response;
  } finally {
    collector.recordRequest(phase, read, performance.now() - startedAt, status);
  }
};

/** Nested backend/command adapters share a single operation-local collector. */
export const withApplyPerformance = async <
  T extends { summary: Readonly<Record<string, unknown>> }
>(
  operation: () => Promise<T>
): Promise<T> => {
  if (operationContext.getStore() !== undefined) return operation();
  const collector = new ApplyPerformance();
  return collector.run(async () => {
    const result = await operation();
    return { ...result, summary: { ...result.summary, githubPerformance: collector.snapshot() } };
  });
};
