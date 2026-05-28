import type { CommandResult } from "../core/command-result.js";

const REDACTED_VALUE = "[REDACTED]";
const GITHUB_TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,})\b/g;
const SENSITIVE_KEY_PARTS = ["token", "authorization", "password", "secret", "apikey"] as const;
const KEY_SEPARATOR_PATTERN = /[-_]/g;

export const redactString = (value: string): string =>
  value.replace(GITHUB_TOKEN_PATTERN, REDACTED_VALUE);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSensitiveKey = (key: string): boolean => {
  const normalizedKey = key.replace(KEY_SEPARATOR_PATTERN, "").toLowerCase();

  return SENSITIVE_KEY_PARTS.some((keyPart) => normalizedKey.includes(keyPart));
};

export const redactValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        isSensitiveKey(key) ? REDACTED_VALUE : redactValue(entryValue)
      ])
    );
  }

  return value;
};

export const redactCommandResult = (result: CommandResult): CommandResult =>
  redactValue(result) as CommandResult;
