import type { StudentPagesAccessResult } from "../../electron/ipc";

// Faculty-facing text for a Pages access check that needs attention, or null when it does not.
export const getStudentPagesAccessWarning = (
  result: StudentPagesAccessResult | undefined,
  retryHint: string
): string | null => {
  if (result === undefined || result.status === "not_configured") return null;
  const details = result.diagnostics.map((item) => item.message);
  const failedUsers =
    result.failedGithubUsernames.length === 0
      ? []
      : [
          `Student access to the Pages site could not be updated for ${result.failedGithubUsernames.join(", ")}.`
        ];
  const messages = [...failedUsers, ...details];
  if (messages.length === 0) return null;
  return result.status === "success" ? messages.join(" ") : [...messages, retryHint].join(" ");
};
