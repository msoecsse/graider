import { expect } from "vitest";

/**
 * `expect.objectContaining` is typed `any`, so nesting one inside another object literal reads
 * as an unsafe assignment. This returns the same matcher as `unknown`, which the assertion
 * helpers accept without leaking `any` into the surrounding literal.
 */
export const objectContaining = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape) as unknown;
