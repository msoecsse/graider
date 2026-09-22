import { describe, expect, it } from "vitest";
import { parseRosterCsvText } from "../../../src/roster/roster-shared-csv.js";

describe("roster shared CSV parsing", () => {
  it("parses quoted fields and embedded commas", () => {
    const content = 'student_id,github_username,section,status\njones,"doe, jane",001,active\n';

    const document = parseRosterCsvText(content);

    expect(document.headers).toEqual(["student_id", "github_username", "section", "status"]);
    expect(document.rows).toEqual([
      { rowNumber: 2, values: ["jones", "doe, jane", "001", "active"] }
    ]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const content = 'student_id,github_username,section,status\njones,"o""brien",001,active\n';

    const document = parseRosterCsvText(content);

    expect(document.rows[0]?.values).toEqual(["jones", 'o"brien', "001", "active"]);
  });

  it("ignores a trailing newline at end of file", () => {
    const content = "student_id,github_username,section,status\njones,jdoe,001,active\n";

    const document = parseRosterCsvText(content);

    expect(document.rows).toHaveLength(1);
  });

  it("handles CRLF line endings", () => {
    const content = "student_id,github_username,section,status\r\njones,jdoe,001,active\r\n";

    const document = parseRosterCsvText(content);

    expect(document.headers).toEqual(["student_id", "github_username", "section", "status"]);
    expect(document.rows[0]?.values).toEqual(["jones", "jdoe", "001", "active"]);
  });

  it("strips a leading UTF-8 byte-order mark", () => {
    const content = "﻿student_id,github_username,section,status\njones,jdoe,001,active\n";

    const document = parseRosterCsvText(content);

    expect(document.headers[0]).toBe("student_id");
  });

  it("skips blank lines between rows", () => {
    const content =
      "student_id,github_username,section,status\n\njones,jdoe,001,active\n\nrpatel,rp,001,active\n";

    const document = parseRosterCsvText(content);

    expect(document.rows).toHaveLength(2);
  });

  it("tolerates a row with fewer values than headers", () => {
    const content = "student_id,github_username,section,status\njones,jdoe,001\n";

    const document = parseRosterCsvText(content);

    expect(document.rows[0]?.values).toEqual(["jones", "jdoe", "001"]);
  });
});
