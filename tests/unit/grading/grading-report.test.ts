import { describe, expect, it } from "vitest";
import {
  GRADING_STATE_SCHEMA_VERSION,
  type GradingState
} from "../../../src/grading/grading-state.js";
import {
  buildGradingReportModel,
  type BuildGradingReportModelInput
} from "../../../src/grading/grading-report-model.js";
import { renderGradingReportHtml } from "../../../src/grading/grading-report-html.js";

const COMMIT_SHA_LENGTH = 40;
const POSITIVE_MANUAL_ADJUSTMENT = 1.5;
const NEGATIVE_MANUAL_ADJUSTMENT = -0.25;
const FOUR_POINT_DEDUCTION = 4;
const SUBMISSION_SHA = "a".repeat(COMMIT_SHA_LENGTH);

const state = (status: GradingState["status"] = "complete"): GradingState => ({
  schemaVersion: GRADING_STATE_SCHEMA_VERSION,
  studentId: "1234567",
  submissionCommitSha: SUBMISSION_SHA,
  status,
  appliedComments: [
    {
      id: "general-1",
      sourceCommentId: "library-copy-1",
      title: "Design rationale",
      text: "Explain the design choice.",
      deduction: -1
    },
    {
      id: "source-1",
      sourceCommentId: "library-copy-2",
      title: "Close resources",
      text: "Close the resource on every path.",
      deduction: -2,
      rubricCategoryId: "correctness",
      sourceLocation: { file: "src/Main.java", startLine: 2, endLine: 3 }
    },
    {
      id: "source-2",
      text: "A second note for the same range.",
      deduction: 0,
      rubricCategoryId: "style",
      sourceLocation: { file: "src/Main.java", startLine: 2, endLine: 2 }
    },
    {
      id: "source-stale",
      text: "This anchored location is no longer present.",
      deduction: -0.5,
      rubricCategoryId: "style",
      sourceLocation: { file: "src/Removed.java", startLine: 4, endLine: 5 }
    }
  ],
  manualAdjustments: [
    {
      id: "adjustment-1",
      rubricCategoryId: "correctness",
      amount: POSITIVE_MANUAL_ADJUSTMENT,
      note: "Recovered edge-case credit."
    },
    {
      id: "adjustment-2",
      rubricCategoryId: "style",
      amount: NEGATIVE_MANUAL_ADJUSTMENT
    }
  ]
});

const baseInput = (status: GradingState["status"] = "complete"): BuildGradingReportModelInput => ({
  course: { code: "SE2030", title: "Software Design" },
  assignment: { slug: "lab-4", title: "Lab 4: Resources" },
  gradingState: state(status),
  rubric: [
    { id: "correctness", name: "Correctness", points: 8 },
    { id: "style", name: "Style", points: 2 }
  ],
  source: {
    sections: [
      {
        status: "found",
        file: "src/Main.java",
        sourceText: 'class Main {\n\tString value = "<&>";\n}',
        sourceLineCount: 3,
        combinedStartLine: 1,
        combinedEndLine: 3,
        insertionLine: 1
      },
      { status: "missing", file: "README.md", insertionLine: 5 }
    ],
    combinedText: "unused by the report",
    syntheticCombinedLines: [4, 5]
  },
  evidence: {
    studentId: "1234567",
    submissionCommitSha: SUBMISSION_SHA,
    evidence: {
      metadata: {
        schemaVersion: 1,
        submissionCommitSha: SUBMISSION_SHA,
        workflowRunId: "42",
        workflowRunAttempt: "1",
        compile: { outcome: "success" },
        junit: { outcome: "failure" },
        checkstyle: { outcome: "failure" }
      },
      junit: {
        available: true,
        outcome: "failure",
        summary: { total: 5, passed: 2, failed: 1, errors: 1, skipped: 1 },
        failures: [
          {
            name: "rejects <script>",
            className: "example.MainTest",
            kind: "failure",
            message: "expected <ok> & got bad",
            details: "at MainTest.java:12\n<script>alert(1)</script>"
          },
          { name: "loads data", kind: "error", message: "I/O error" }
        ]
      },
      checkstyle: {
        available: true,
        outcome: "failure",
        violationCount: 2,
        violations: [
          {
            file: "src/Main.java",
            fileKind: "repository_relative",
            line: 2,
            column: 3,
            severity: "warning",
            message: "Avoid < and & in names",
            source: "Indentation"
          },
          {
            file: "/tmp/<outside>",
            fileKind: "noncanonical",
            severity: "error",
            message: "Noncanonical path"
          }
        ]
      }
    }
  },
  commitHistory: {
    studentId: "1234567",
    submissionCommitSha: SUBMISSION_SHA,
    commits: [
      {
        sha: "b".repeat(COMMIT_SHA_LENGTH),
        committedAt: "2026-09-10T14:05:06-05:00",
        message: "Newest <b>commit</b>"
      },
      {
        sha: "c".repeat(COMMIT_SHA_LENGTH),
        committedAt: "2026-09-09T01:02:03Z",
        message: "Older & stable"
      }
    ]
  }
});

const buildModel = (input = baseInput()) => {
  const result = buildGradingReportModel(input);
  expect(result.status).toBe("success");
  if (result.status !== "success") throw new Error(result.message);
  return result.value;
};

const evidenceFrom = (input: BuildGradingReportModelInput) => {
  if (input.evidence === undefined) throw new Error("Expected evidence fixture.");
  return input.evidence;
};

const commitHistoryFrom = (input: BuildGradingReportModelInput) => {
  if (input.commitHistory === undefined) throw new Error("Expected commit history fixture.");
  return input.commitHistory;
};

const firstCommitFrom = (input: BuildGradingReportModelInput) => {
  const commit = commitHistoryFrom(input).commits[0];
  if (commit === undefined) throw new Error("Expected commit fixture.");
  return commit;
};

const withoutEvidence = (input: BuildGradingReportModelInput): BuildGradingReportModelInput => {
  const copy = { ...input };
  delete copy.evidence;
  return copy;
};

describe("grading report model", () => {
  it("uses the canonical grade projection and preserves rubric, comments, and adjustments", () => {
    const model = buildModel();

    expect(model.grade).toEqual({
      pointsPossible: 10,
      totalScore: 7.75,
      categories: [
        {
          id: "correctness",
          name: "Correctness",
          pointsPossible: 8,
          score: 7.5,
          categorizedCommentAdjustmentTotal: -2,
          manualAdjustmentTotal: 1.5
        },
        {
          id: "style",
          name: "Style",
          pointsPossible: 2,
          score: 1.25,
          categorizedCommentAdjustmentTotal: -0.5,
          manualAdjustmentTotal: -0.25
        }
      ],
      uncategorizedCommentAdjustmentTotal: -1
    });
    expect(model.generalComments.map(({ text }) => text)).toEqual(["Explain the design choice."]);
    expect(model.generalComments.map(({ title }) => title)).toEqual(["Design rationale"]);
    expect(model.sourceFiles.map(({ file }) => file)).toEqual(["src/Main.java", "README.md"]);
    expect(model.sourceFiles[0]?.comments).toHaveLength(2);
    expect(model.unmappedSourceComments).toEqual([
      expect.objectContaining({ id: "source-stale", locationAvailable: false })
    ]);
    expect(model.manualAdjustments.map(({ amount }) => amount)).toEqual([
      POSITIVE_MANUAL_ADJUSTMENT,
      NEGATIVE_MANUAL_ADJUSTMENT
    ]);
  });

  it("rejects evidence or history for another grading identity", () => {
    const evidenceInput = baseInput();
    const evidenceMismatch = buildGradingReportModel({
      ...evidenceInput,
      evidence: { ...evidenceFrom(evidenceInput), studentId: "7654321" }
    });
    const historyInput = baseInput();
    const historyMismatch = buildGradingReportModel({
      ...historyInput,
      commitHistory: {
        ...commitHistoryFrom(historyInput),
        submissionCommitSha: "d".repeat(COMMIT_SHA_LENGTH)
      }
    });

    expect(evidenceMismatch).toEqual(
      expect.objectContaining({ status: "failure", code: "report_evidence_identity_mismatch" })
    );
    expect(historyMismatch).toEqual(
      expect.objectContaining({
        status: "failure",
        code: "report_commit_history_identity_mismatch"
      })
    );
  });
});

describe("grading report HTML", () => {
  it("is a deterministic standalone document with the specified section order", () => {
    const model = buildModel();
    const first = renderGradingReportHtml(model);
    const second = renderGradingReportHtml(model);

    expect(first).toBe(second);
    expect(first.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(first).toContain('<meta charset="utf-8">');
    expect(first).toContain("default-src 'none'; style-src 'unsafe-inline'");
    expect(first).not.toContain("<script");
    expect(first).not.toContain("generated at");
    expect(first.indexOf('id="grade-summary"')).toBeLessThan(first.indexOf('id="rubric"'));
    expect(first.indexOf('id="rubric"')).toBeLessThan(first.indexOf('id="general-feedback"'));
    expect(first.indexOf('id="general-feedback"')).toBeLessThan(first.indexOf('id="source"'));
    expect(first.indexOf('id="source"')).toBeLessThan(first.indexOf('id="automated-checks"'));
    expect(first.indexOf('id="automated-checks"')).toBeLessThan(
      first.indexOf('id="commit-history"')
    );
    expect(first.indexOf("Unit Tests")).toBeLessThan(first.indexOf("Checkstyle"));
  });

  it("renders the identity, canonical score explanation, comments, and adjustments", () => {
    const html = renderGradingReportHtml(buildModel());

    expect(html).toContain("Lab 4: Resources");
    expect(html).toContain("SE2030 — Software Design");
    expect(html).toContain("Student 1234567");
    expect(html).toContain("7.75 / 10 points");
    expect(html.indexOf("Correctness")).toBeLessThan(html.indexOf("Style"));
    expect(html).toContain("Uncategorized comment adjustments");
    expect(html).toContain("Recovered edge-case credit.");
    expect(html).toContain("+1.5");
    expect(html).toContain("-0.25");
    expect(html).toContain("Explain the design choice.");
    expect(html).toContain("Close the resource on every path.");
  });

  it("renders legacy and positive stored deductions as negative score adjustments", () => {
    const positive = buildGradingReportModel({
      ...baseInput(),
      gradingState: {
        ...state(),
        appliedComments: [{ id: "positive", text: "Deduct four.", deduction: FOUR_POINT_DEDUCTION }]
      }
    });
    if (positive.status !== "success") throw new Error("Expected report model.");
    expect(positive.value.generalComments[0]?.deduction).toBe(-FOUR_POINT_DEDUCTION);
    expect(renderGradingReportHtml(positive.value)).toContain("Score adjustment: -4");

    const legacy = buildGradingReportModel({
      ...baseInput(),
      gradingState: {
        ...state(),
        appliedComments: [{ id: "legacy", text: "Deduct four.", deduction: -FOUR_POINT_DEDUCTION }]
      }
    });
    if (legacy.status !== "success") throw new Error("Expected report model.");
    expect(renderGradingReportHtml(legacy.value)).toContain("Score adjustment: -4");
  });

  it("renders a pre-code source-feedback index and inline source comments without duplicates", () => {
    const html = renderGradingReportHtml(buildModel());

    expect(html.indexOf('id="source-feedback-index-heading"')).toBeLessThan(
      html.indexOf('<table class="source-code">')
    );
    expect(html).toContain(
      'href="#source-comment-2">Close resources — src/Main.java, lines 2–3</a>'
    );
    expect(html).toContain('href="#source-comment-3">Feedback 3 — src/Main.java, line 2</a>');
    expect(html).not.toContain('href="#source-comment-4"');
    expect(html).toContain('id="source-file-1-line-2"');
    expect(html).toContain('id="source-file-1-line-3" class="has-feedback"');
    expect(html).toContain('id="source-comment-2"');
    expect(html).toContain('id="source-comment-3"');
    expect(html).toContain("<h4>Close resources</h4>");
    expect(html).toContain("<h4>Feedback 3</h4>");
    expect(html.indexOf("<h4>Close resources</h4>")).toBeLessThan(
      html.indexOf("<h4>Feedback 3</h4>")
    );
    expect(html).toContain("Rubric: Correctness · Score adjustment: -2");
    expect(html.match(/Close the resource on every path\./gu)).toHaveLength(1);
    expect(html.match(/A second note for the same range\./gu)).toHaveLength(1);
    expect(html).toContain("Required file unavailable.");
    expect(html).toContain("Location unavailable in the anchored submission source.");
    expect(html).toContain("src/Removed.java, lines 4–5");
    expect(html).toContain("This anchored location is no longer present.");
    expect(html).not.toContain("combinedStartLine");
    expect(html).not.toContain("syntheticCombinedLines");
    expect(html).toContain("\tString value");
  });

  it("escapes source-feedback titles while retaining valid source and Checkstyle anchors", () => {
    const input = baseInput();
    const html = renderGradingReportHtml(
      buildModel({
        ...input,
        gradingState: {
          ...input.gradingState,
          appliedComments: input.gradingState.appliedComments.map((comment) =>
            comment.id === "source-1" ? { ...comment, title: '<source & "title">' } : comment
          )
        }
      })
    );

    expect(html).toContain("&lt;source &amp; &quot;title&quot;&gt;");
    expect(html).toContain('href="#source-file-1-line-2">src/Main.java:2:3</a>');
    expect(html).toContain('id="source-file-1-line-2"');
  });

  it("renders normalized Checkstyle and JUnit evidence without changing the grade", () => {
    const html = renderGradingReportHtml(buildModel());

    expect(html).toContain('Compile</dt><dd><span class="outcome">Passed');
    expect(html).toContain('Checkstyle</dt><dd><span class="outcome">Failed');
    expect(html).toContain("2 violations");
    expect(html).toContain("src/Main.java:2:3");
    expect(html).toContain("Noncanonical location");
    expect(html).toContain('Unit Tests</dt><dd><span class="outcome">Failed');
    expect(html).toContain("Total</th><td>5");
    expect(html).toContain("Passed</th><td>2");
    expect(html).toContain("Failure: rejects &lt;script&gt;");
    expect(html).toContain("Error: loads data");
    expect(html).toContain("7.75 / 10 points");
  });

  it("omits Automated Checks when trusted evidence is absent", () => {
    const html = renderGradingReportHtml(buildModel(withoutEvidence(baseInput())));

    expect(html).not.toContain('id="automated-checks"');
    expect(html).not.toContain("Automated evidence unavailable");
  });

  it("does not claim all tests passed from counts when the phase failed", () => {
    const input = baseInput();
    const evidence = evidenceFrom(input);
    const html = renderGradingReportHtml(
      buildModel({
        ...input,
        evidence: {
          ...evidence,
          evidence: {
            ...evidence.evidence,
            junit: {
              available: true,
              outcome: "failure",
              summary: { total: 0, passed: 0, failed: 0, errors: 0, skipped: 0 },
              failures: []
            }
          }
        }
      })
    );

    expect(html).not.toContain("All reported tests passed.");
  });

  it("renders the normalized successful JUnit summary without individual passing tests", () => {
    const input = baseInput();
    const evidence = evidenceFrom(input);
    const html = renderGradingReportHtml(
      buildModel({
        ...input,
        evidence: {
          ...evidence,
          evidence: {
            ...evidence.evidence,
            metadata: {
              ...evidence.evidence.metadata,
              junit: { outcome: "success" }
            },
            junit: {
              available: true,
              outcome: "success",
              summary: { total: 2, passed: 2, failed: 0, errors: 0, skipped: 0 },
              failures: []
            }
          }
        }
      })
    );

    expect(html).toContain("All reported tests passed.");
    expect(html).not.toContain("Successful test:");
  });

  it("preserves supplied commit order and uses deterministic semantic timestamps", () => {
    const html = renderGradingReportHtml(buildModel());

    expect(html.indexOf("bbbbbbbb")).toBeLessThan(html.indexOf("cccccccc"));
    expect(html).toContain(`title="${"b".repeat(COMMIT_SHA_LENGTH)}"`);
    expect(html).toContain(
      '<time datetime="2026-09-10T14:05:06-05:00">2026-09-10 14:05:06 -05:00</time>'
    );
    expect(html).toContain('<time datetime="2026-09-09T01:02:03Z">2026-09-09 01:02:03 Z</time>');
  });

  it("renders an empty supplied history neutrally", () => {
    const input = baseInput();
    const html = renderGradingReportHtml(
      buildModel({ ...input, commitHistory: { ...commitHistoryFrom(input), commits: [] } })
    );

    expect(html).toContain('id="commit-history"');
    expect(html).toContain("No commits available.");
  });

  it.each(["not_started", "in_progress", "complete", "published"] as const)(
    "renders status %s without imposing publication eligibility",
    (status) => {
      const html = renderGradingReportHtml(buildModel(baseInput(status)));
      expect(html).toContain(`data-grading-status="${status}"`);
    }
  );

  it("escapes hostile values in every untrusted report area", () => {
    const input = baseInput();
    const hostile = `<script data-x="&quot;">alert("x")</script> & ' "`;
    const hostileState: GradingState = {
      ...input.gradingState,
      studentId: hostile,
      appliedComments: [{ id: "hostile", text: hostile, deduction: -1 }],
      manualAdjustments: []
    };
    const html = renderGradingReportHtml(
      buildModel({
        ...input,
        course: { code: hostile, title: hostile },
        assignment: { slug: "hostile", title: hostile },
        gradingState: hostileState,
        rubric: [{ id: "hostile", name: hostile, points: 1 }],
        source: {
          sections: [
            {
              status: "found",
              file: hostile,
              sourceText: hostile,
              sourceLineCount: 1,
              combinedStartLine: 1,
              combinedEndLine: 1,
              insertionLine: 1
            }
          ],
          combinedText: hostile,
          syntheticCombinedLines: []
        },
        evidence: {
          ...evidenceFrom(input),
          studentId: hostile,
          evidence: {
            ...evidenceFrom(input).evidence,
            junit: {
              ...evidenceFrom(input).evidence.junit,
              failures: [{ name: hostile, kind: "failure", message: hostile, details: hostile }]
            },
            checkstyle: {
              ...evidenceFrom(input).evidence.checkstyle,
              violations: [
                {
                  file: hostile,
                  fileKind: "noncanonical",
                  severity: hostile,
                  message: hostile,
                  source: hostile
                }
              ]
            }
          }
        },
        commitHistory: {
          ...commitHistoryFrom(input),
          studentId: hostile,
          commits: [{ ...firstCommitFrom(input), message: hostile }]
        }
      })
    );

    expect(html).not.toContain("<script data-x");
    expect(html).not.toContain('alert("x")</script>');
    expect(html).toContain("&lt;script data-x=&quot;&amp;quot;&quot;&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&#39;");
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });
});
