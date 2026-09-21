import { describe, expect, it } from "vitest";
import { formatReadableDateTime } from "./dateTime";

describe("formatReadableDateTime", () => {
  it("returns null for a null timestamp", () => {
    expect(formatReadableDateTime(null)).toBeNull();
  });

  it("returns null for an unparseable timestamp, not the literal 'Invalid Date'", () => {
    expect(formatReadableDateTime("not-a-date")).toBeNull();
  });

  it("formats a valid timestamp as weekday, month, day, and time -- never the raw ISO string", () => {
    const formatted = formatReadableDateTime(
      "2026-06-15T12:00:00.000Z",
      new Date("2026-06-01T12:00:00.000Z")
    );

    expect(formatted).not.toBeNull();
    expect(formatted).not.toContain("2026-06-15T12:00:00");
    expect(formatted).toMatch(/^[A-Za-z]{3} Jun 15, \d{1,2}:\d{2} [AP]M$/u);
  });

  it("omits the year when the timestamp falls in the same year as now", () => {
    const formatted = formatReadableDateTime(
      "2026-06-15T12:00:00.000Z",
      new Date("2026-12-01T12:00:00.000Z")
    );

    expect(formatted).not.toContain("2026");
  });

  it("includes the year when the timestamp falls outside the year of now", () => {
    const formatted = formatReadableDateTime(
      "2025-06-15T12:00:00.000Z",
      new Date("2026-06-01T12:00:00.000Z")
    );

    expect(formatted).toMatch(/^[A-Za-z]{3} Jun 15, 2025, \d{1,2}:\d{2} [AP]M$/u);
  });
});
