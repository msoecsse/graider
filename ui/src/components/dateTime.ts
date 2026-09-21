const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "short" });

const MONTH_DAY_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const MONTH_DAY_YEAR_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

/**
 * README section 2.3: "Mon Jun 15, 11:59 PM" -- weekday, month, day, time,
 * with the year added only when the timestamp falls outside `now`'s year (a
 * due date from the current term doesn't need one; one from a past term
 * does -- see the section 2.3 clarification this implements). The one place
 * every screen renders a timestamp to faculty, replacing three formatters
 * that each rendered the same kind of value differently.
 *
 * `now` defaults to the real current time; callers never need to pass it in
 * production. Tests pass a fixed value so the year boundary doesn't depend
 * on when the suite runs.
 */
export const formatReadableDateTime = (
  timestamp: string | null,
  now: Date = new Date()
): string | null => {
  if (timestamp === null) {
    return null;
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const monthDayTime =
    date.getFullYear() === now.getFullYear()
      ? MONTH_DAY_TIME_FORMATTER.format(date)
      : MONTH_DAY_YEAR_TIME_FORMATTER.format(date);

  return `${WEEKDAY_FORMATTER.format(date)} ${monthDayTime}`;
};
