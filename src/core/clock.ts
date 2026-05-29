export interface Clock {
  now(): Date;
}

const COLON_PATTERN = /:/gu;
const PERIOD_PATTERN = /\./gu;
const FILESYSTEM_TIMESTAMP_SEPARATOR = "-";

export const systemClock: Clock = {
  now: () => new Date()
};

export const formatPlanCreatedAt = (date: Date): string => date.toISOString();

export const formatFilesystemTimestamp = (date: Date): string =>
  date
    .toISOString()
    .replace(COLON_PATTERN, FILESYSTEM_TIMESTAMP_SEPARATOR)
    .replace(PERIOD_PATTERN, FILESYSTEM_TIMESTAMP_SEPARATOR);
