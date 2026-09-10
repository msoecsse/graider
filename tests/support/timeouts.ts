/**
 * Timeouts for the suites whose cost is process spawning rather than computation. Vitest's 5s
 * default is right for the unit tests and wrong for these, which exceed it under the parallel
 * load of a full run even though each passes comfortably in isolation. Both values are loose
 * enough to absorb that load and tight enough to still catch a genuine hang.
 */

/** Tests that drive real `git` through many subprocess round-trips. */
export const GIT_TEST_TIMEOUT_MS = 30000;

/**
 * Tests that spawn the CLI as `node --import tsx src/cli/index.ts`, paying a full TypeScript
 * transpile per invocation.
 */
export const CLI_SPAWN_TEST_TIMEOUT_MS = 30000;
