import { rm } from "node:fs/promises";

/**
 * Tests that drive real `git` in temp directories hit `EBUSY: resource busy or locked` on
 * Windows when cleanup races a Git child process that still holds a handle on the tree. Node's
 * `rm` retries exactly that class of error when asked, so ask.
 */
const REMOVE_MAX_RETRIES = 10;
const REMOVE_RETRY_DELAY_MS = 50;

export const removeTemporaryDirectory = async (directory: string): Promise<void> => {
  await rm(directory, {
    force: true,
    recursive: true,
    maxRetries: REMOVE_MAX_RETRIES,
    retryDelay: REMOVE_RETRY_DELAY_MS
  });
};

/** Removes and drains a list of temp roots; safe to call from `afterEach`. */
export const removeTemporaryDirectories = async (directories: string[]): Promise<void> => {
  await Promise.all(directories.splice(0).map(removeTemporaryDirectory));
};
