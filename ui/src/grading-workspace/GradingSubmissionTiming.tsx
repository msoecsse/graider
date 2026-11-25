import type { ReactElement } from "react";

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;
const TIMESTAMP_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

const parseTimestamp = (value: string | undefined): number =>
  value !== undefined && TIMESTAMP_WITH_TIMEZONE.test(value) ? Date.parse(value) : NaN;

const timingLabel = (dueAt: string | undefined, submittedAt: string | undefined): string => {
  if (dueAt === undefined) return "No due date";
  const due = parseTimestamp(dueAt);
  if (!Number.isFinite(due)) return "Due time unavailable";
  const submitted = parseTimestamp(submittedAt);
  if (!Number.isFinite(submitted)) return "Submission time unavailable";
  const elapsed = submitted - due;
  if (elapsed <= 0) return "On time";
  const minutes = Math.floor(elapsed / MILLISECONDS_PER_MINUTE);
  if (minutes === 0) return "Late by less than a minute";
  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const remainder = minutes % MINUTES_PER_HOUR;
  const units = [
    [days, "day"],
    [hours, "hour"],
    [remainder, "minute"]
  ] as const;
  const duration = units
    .filter(([count]) => count > 0)
    .map(([count, unit]) => `${count} ${unit}${count === 1 ? "" : "s"}`)
    .join(", ");
  return `Late by ${duration}`;
};

export const GradingSubmissionTiming = ({
  studentId,
  dueAt,
  submittedAt
}: {
  readonly studentId: string;
  readonly dueAt?: string | undefined;
  readonly submittedAt?: string | undefined;
}): ReactElement => (
  <p aria-label={`Submission timing for ${studentId}`}>
    {studentId} ·{" "}
    <span
      className="status-chip"
      title="Based on the last substantive change in local submission history. Informational only; no score penalty."
    >
      {timingLabel(dueAt, submittedAt)}
    </span>
  </p>
);
