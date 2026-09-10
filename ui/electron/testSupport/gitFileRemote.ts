import { pathToFileURL } from "node:url";

/**
 * Turns a local directory into a `file://` remote URL for tests that need a pushable remote.
 *
 * Production remotes are URLs, so readiness checks compare them with `/owner/repo` suffixes.
 * Handing `git remote add` a bare filesystem path instead makes that comparison depend on the
 * host separator: it passes on POSIX by coincidence and fails on Windows, where
 * `git remote get-url` echoes back `C:\...\owner\repo`. A `file://` URL is pushable and always
 * separated by `/`, so the test exercises the same shape production does.
 */
export const toGitFileRemote = (directory: string): string => pathToFileURL(directory).href;
