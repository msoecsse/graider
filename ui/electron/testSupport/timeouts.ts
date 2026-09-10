/**
 * Timeouts for the suites whose cost is process spawning rather than computation.
 *
 * Vitest's 5s default is right for the rest of the UI tests and wrong for these, which drive
 * real `git` through many subprocess round-trips: several sit at 2.5-4.7s even in isolation and
 * exceed 5s under the parallel load of a full run. This value absorbs that load and is still
 * tight enough to catch a genuine hang.
 */
export const GIT_TEST_TIMEOUT_MS = 30000;
