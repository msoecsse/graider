import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseGradingEvidence } from "../../../src/grading/grading-evidence-parser.js";

const metadata = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    schemaVersion: 1,
    submissionCommitSha: "0123456789abcdef0123456789abcdef01234567",
    workflowRunId: "1234",
    workflowRunAttempt: "2",
    compile: { outcome: "success" },
    junit: { outcome: "success" },
    checkstyle: { outcome: "success" },
    ...overrides
  });

const junit = (testcases: string): string =>
  `<?xml version="1.0"?><testsuite name="JUnit Jupiter">${testcases}</testsuite>`;

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/grading-evidence"
);
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURE_ROOT, name), "utf8");

describe("parseGradingEvidence", () => {
  it("normalizes JUnit reports and Checkstyle violations without calculating grades", () => {
    const result = parseGradingEvidence({
      metadataJson: metadata({ junit: { outcome: "failure" }, checkstyle: { outcome: "failure" } }),
      junitReports: [
        {
          name: "TEST-junit-jupiter.xml",
          content: fixture("junit-mixed.xml")
        }
      ],
      checkstyleXml: fixture("checkstyle-violations.xml")
    });

    expect(result).toEqual({
      status: "success",
      value: {
        metadata: {
          schemaVersion: 1,
          submissionCommitSha: "0123456789abcdef0123456789abcdef01234567",
          workflowRunId: "1234",
          workflowRunAttempt: "2",
          compile: { outcome: "success" },
          junit: { outcome: "failure" },
          checkstyle: { outcome: "failure" }
        },
        junit: {
          available: true,
          outcome: "failure",
          summary: { total: 4, passed: 1, failed: 1, errors: 1, skipped: 1 },
          failures: [
            {
              name: "fails",
              className: "Example",
              kind: "failure",
              message: "expected true",
              details: "stack detail"
            },
            { name: "errors", kind: "error", message: "broken", details: "error detail" }
          ]
        },
        checkstyle: {
          available: true,
          outcome: "failure",
          violationCount: 2,
          violations: [
            {
              file: "src/Example.java",
              fileKind: "repository_relative",
              line: 4,
              column: 2,
              severity: "warning",
              message: "Avoid tabs",
              source: "com.example.TabCheck"
            },
            {
              file: "src/Other.java",
              fileKind: "repository_relative",
              line: 9,
              severity: "error",
              message: "Missing Javadoc"
            }
          ]
        }
      }
    });
  });

  it("aggregates multiple JUnit report files in input order", () => {
    const result = parseGradingEvidence({
      metadataJson: fixture("metadata-failed-tests.json"),
      junitReports: [
        {
          name: "first.xml",
          content: junit('<testcase name="first"><failure message="one"/></testcase>')
        },
        {
          name: "second.xml",
          content: junit('<testcase name="second"><error message="two"/></testcase>')
        }
      ]
    });

    expect(result).toMatchObject({
      status: "success",
      value: {
        junit: {
          available: true,
          summary: { total: 2, passed: 0, failed: 1, errors: 1, skipped: 0 },
          failures: [
            { name: "first", kind: "failure", message: "one" },
            { name: "second", kind: "error", message: "two" }
          ]
        },
        checkstyle: { available: false, violationCount: 0, violations: [] }
      }
    });
  });

  it("keeps skipped phases with no report distinct from successful zero-result reports", () => {
    const skipped = parseGradingEvidence({
      metadataJson: fixture("metadata-compile-failure.json"),
      junitReports: []
    });
    const zeroResults = parseGradingEvidence({
      metadataJson: fixture("metadata-success.json"),
      junitReports: [{ name: "empty.xml", content: junit("") }],
      checkstyleXml: fixture("checkstyle-zero.xml")
    });

    expect(skipped).toMatchObject({
      status: "success",
      value: {
        metadata: { compile: { outcome: "failure" } },
        junit: { available: false, outcome: "skipped" }
      }
    });
    expect(zeroResults).toMatchObject({
      status: "success",
      value: {
        junit: { available: true, outcome: "success", summary: { total: 0 } },
        checkstyle: { available: true, outcome: "success", violationCount: 0 }
      }
    });
  });

  it("rejects invalid metadata, malformed XML, and contradictory skipped reports safely", () => {
    expect(parseGradingEvidence({ metadataJson: "{", junitReports: [] })).toMatchObject({
      status: "failure",
      error: { code: "metadata_invalid" }
    });
    expect(
      parseGradingEvidence({ metadataJson: metadata({ schemaVersion: 2 }), junitReports: [] })
    ).toMatchObject({ status: "failure", error: { code: "metadata_version_unsupported" } });
    expect(
      parseGradingEvidence({
        metadataJson: metadata({ submissionCommitSha: "not-a-sha" }),
        junitReports: []
      })
    ).toMatchObject({ status: "failure", error: { code: "metadata_invalid" } });
    expect(
      parseGradingEvidence({
        metadataJson: metadata(),
        junitReports: [{ name: "bad.xml", content: fixture("junit-malformed.xml") }]
      })
    ).toMatchObject({
      status: "failure",
      error: { code: "junit_report_invalid", reportName: "bad.xml" }
    });
    expect(
      parseGradingEvidence({
        metadataJson: metadata(),
        junitReports: [],
        checkstyleXml: fixture("checkstyle-malformed.xml")
      })
    ).toMatchObject({ status: "failure", error: { code: "checkstyle_report_invalid" } });
    expect(
      parseGradingEvidence({
        metadataJson: metadata(),
        junitReports: [
          {
            name: "unsafe.xml",
            content:
              '<!DOCTYPE testsuite [<!ENTITY unsafe SYSTEM "file:///not-read">]><testsuite name="x"><testcase name="&unsafe;"/></testsuite>'
          }
        ]
      })
    ).toMatchObject({ status: "failure", error: { code: "junit_report_invalid" } });
    expect(
      parseGradingEvidence({
        metadataJson: metadata({ junit: { outcome: "skipped" } }),
        junitReports: [{ name: "report.xml", content: junit("") }]
      })
    ).toMatchObject({ status: "failure", error: { code: "evidence_inconsistent" } });
  });

  it("marks absolute Checkstyle filenames noncanonical without resolving them", () => {
    const result = parseGradingEvidence({
      metadataJson: metadata(),
      junitReports: [],
      checkstyleXml:
        '<checkstyle><file name="/home/runner/work/student/src/Example.java"><error line="1" severity="warning" message="x"/></file></checkstyle>'
    });

    expect(result).toMatchObject({
      status: "success",
      value: {
        checkstyle: {
          violations: [
            { file: "/home/runner/work/student/src/Example.java", fileKind: "noncanonical" }
          ]
        }
      }
    });
  });

  it("accepts an absent Checkstyle column or line but rejects invalid supplied coordinates", () => {
    expect(
      parseGradingEvidence({
        metadataJson: metadata(),
        junitReports: [],
        checkstyleXml:
          '<checkstyle><file name="src/Example.java"><error severity="warning" message="x"/></file></checkstyle>'
      })
    ).toMatchObject({
      status: "success",
      value: { checkstyle: { violations: [{ file: "src/Example.java" }] } }
    });
    expect(
      parseGradingEvidence({
        metadataJson: metadata(),
        junitReports: [],
        checkstyleXml:
          '<checkstyle><file name="src/Example.java"><error line="0" severity="warning" message="x"/></file></checkstyle>'
      })
    ).toMatchObject({ status: "failure", error: { code: "checkstyle_report_invalid" } });
  });

  it("rejects invalid outcome values and keeps a failed Checkstyle report informational", () => {
    expect(
      parseGradingEvidence({
        metadataJson: metadata({ checkstyle: { outcome: "unknown" } }),
        junitReports: []
      })
    ).toMatchObject({ status: "failure", error: { code: "metadata_invalid" } });

    expect(
      parseGradingEvidence({
        metadataJson: fixture("metadata-checkstyle-violations.json"),
        junitReports: [{ name: "passing.xml", content: fixture("junit-passing.xml") }],
        checkstyleXml: fixture("checkstyle-violations.xml")
      })
    ).toMatchObject({
      status: "success",
      value: {
        metadata: { checkstyle: { outcome: "failure" } },
        checkstyle: { violationCount: 2 }
      }
    });
  });
});
