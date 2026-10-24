import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  reviewSchema,
  reviewJsonSchema,
  MAX_REVIEW_FILES,
  MAX_REVIEW_FILE_BYTES,
  reviewFindingKey,
  type Review
} from "../../../src/review-import/review-schema.js";
import { parseReviewInput, type ReviewInput } from "../../../src/review-import/review-input.js";
import { planReviewImport } from "../../../src/review-import/review-planner.js";
import type {
  ReviewImportContext,
  FindingPlan,
  ReviewPlan,
  ReviewRepositoryReader
} from "../../../src/review-import/review-plan-models.js";
import {
  createInitialGradingState,
  validateGradingState,
  type GradingState
} from "../../../src/grading/grading-state.js";
import { editAppliedComment } from "../../../src/grading/grading-state-operations.js";

const fixtureDirectory = new URL("../../../docs/examples/review-import/", import.meta.url);
const fixture = (name = "exact-match"): Review =>
  reviewSchema.parse(
    JSON.parse(fs.readFileSync(new URL(`${name}.json`, fixtureDirectory), "utf8")) as unknown
  );
const SHA1_LENGTH = 40;
const SHA256_LENGTH = 64;
const FRACTIONAL_DEDUCTION = 2.5;
const NEGATIVE_DEDUCTION = -1;
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
};
const CURRENT_SHA = "a".repeat(SHA1_LENGTH);
const PREVIOUS_SHA = "b".repeat(SHA1_LENGTH);
const SOURCE = "class Main {\n    input.trim();\n}\n";
const RECOVERED_SOURCE = `// Added header\n${SOURCE}`;
const reviewInput = (review: Review, filename = "review.json"): ReviewInput => ({
  filename,
  content: JSON.stringify(review)
});
const generalReview = (): Review => ({
  ...fixture(),
  findings: [{ id: "general", title: "General feedback", deduction: 2 }]
});
const reader = (overrides: Partial<ReviewRepositoryReader> = {}): ReviewRepositoryReader => ({
  matchesRepository: () => Promise.resolve(true),
  isInHistory: () => Promise.resolve(true),
  readRevisionFile: () => Promise.resolve(SOURCE),
  ...overrides
});
const context = (
  options: {
    readonly reader?: ReviewRepositoryReader | null;
    readonly state?: GradingState | null;
  } = {}
): ReviewImportContext => ({
  assignment: fixture().assignment,
  rubric: [{ id: "correctness", name: "Correctness", points: 10 }],
  submissions: [
    {
      student: { studentId: "jdoe", githubUsername: "jane-doe" },
      repository: { owner: "msoe-course", name: "lab4-jane-doe" },
      currentCommitSha: CURRENT_SHA,
      gradingState: options.state ?? null,
      diagnostics: []
    }
  ],
  repository: () => Promise.resolve(options.reader === undefined ? reader() : options.reader)
});
const single = async (review = fixture(), ctx = context()): Promise<ReviewPlan> => {
  const plan = await planReviewImport([reviewInput(review)], ctx);
  const item = plan.reviews[0];
  if (item === undefined) throw new Error("Missing review plan");
  return item;
};
const first = (plan: ReviewPlan): FindingPlan => {
  const finding = plan.findings[0];
  if (finding === undefined) throw new Error("Missing finding plan");
  return finding;
};
const stateWithImport = (): GradingState => {
  const initial = createInitialGradingState("jdoe", CURRENT_SHA);
  if (initial.status !== "success") throw new Error("Invalid test state");
  return {
    ...initial.value,
    status: "complete",
    finalScoreOverride: 0,
    manualAdjustments: [
      { id: "note", rubricCategoryId: "correctness", amount: 1, note: "Preserve this note" }
    ],
    appliedComments: [
      { id: "manual", text: "Manual feedback", deduction: 3 },
      {
        id: "imported",
        text: "Faculty edited text",
        title: "Edited title",
        deduction: 4,
        importProvenance: {
          source: "review_import",
          schemaVersion: 1,
          reviewId: fixture().reviewId,
          findingId: "null-input"
        }
      }
    ]
  };
};

describe("review schema v1", () => {
  it("parses a minimal general review and full documented review", () => {
    expect(reviewSchema.safeParse(generalReview()).success).toBe(true);
    expect(reviewSchema.safeParse(fixture()).success).toBe(true);
  });
  it.each([
    ["title", { title: "Title" }],
    ["text", { text: "Body" }],
    ["both", { title: "Title", text: "Body" }]
  ])("accepts %s content", (_, content) => {
    expect(
      reviewSchema.safeParse({
        ...generalReview(),
        findings: [{ id: "one", deduction: 0, ...content }]
      }).success
    ).toBe(true);
  });
  it.each([{}, { title: " " }, { text: " " }])("rejects empty content %j", (content) => {
    expect(
      reviewSchema.safeParse({
        ...generalReview(),
        findings: [{ id: "one", deduction: 0, ...content }]
      }).success
    ).toBe(false);
  });
  it.each([0, 1, FRACTIONAL_DEDUCTION])("preserves deduction %s", (deduction) => {
    expect(
      reviewSchema.parse({
        ...generalReview(),
        findings: [{ id: "one", title: "Finding", deduction }]
      }).findings[0]?.deduction
    ).toBe(deduction);
  });
  it.each([NEGATIVE_DEDUCTION, "2", null, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects deduction %s",
    (deduction) => {
      expect(
        reviewSchema.safeParse({
          ...generalReview(),
          findings: [{ id: "one", title: "Finding", deduction }]
        }).success
      ).toBe(false);
    }
  );
  it("requires primary identity and complete repository/assignment identity", () => {
    expect(reviewSchema.safeParse({ ...fixture(), student: { displayName: "Jane" } }).success).toBe(
      false
    );
    expect(reviewSchema.safeParse({ ...fixture(), repository: { name: "repo" } }).success).toBe(
      false
    );
    expect(
      reviewSchema.safeParse({ ...fixture(), assignment: { courseCode: "CS1021" } }).success
    ).toBe(false);
  });
  it.each(["a", "a".repeat(SHA1_LENGTH - 1), "A".repeat(SHA1_LENGTH), "z".repeat(SHA1_LENGTH)])(
    "rejects noncanonical SHA %s",
    (reviewedCommitSha) => {
      expect(
        reviewSchema.safeParse({
          ...fixture(),
          repository: { ...fixture().repository, reviewedCommitSha }
        }).success
      ).toBe(false);
    }
  );
  it("accepts a full SHA256", () => {
    expect(
      reviewSchema.safeParse({
        ...fixture(),
        repository: { ...fixture().repository, reviewedCommitSha: "a".repeat(SHA256_LENGTH) }
      }).success
    ).toBe(true);
  });
  it.each([
    "/etc/passwd",
    "../Main.java",
    "src/../Main.java",
    "src/./Main.java",
    "src//Main.java",
    "C:/Main.java",
    "C:Main.java",
    "\\\\host\\file",
    "src\\Main.java",
    "src/",
    "src/\u0000.java"
  ])("rejects unsafe path %s", (file) => {
    expect(
      reviewSchema.safeParse({
        ...fixture(),
        findings: [
          {
            id: "one",
            title: "Finding",
            deduction: 0,
            sourceLocation: { file, startLine: 1, endLine: 1, excerpt: "line" }
          }
        ]
      }).success
    ).toBe(false);
  });
  it.each([
    { startLine: 0, endLine: 1, excerpt: "line" },
    { startLine: 2, endLine: 1, excerpt: "line" },
    { startLine: 1, endLine: 2, excerpt: "line" },
    { startLine: 1, endLine: 1, excerpt: "" },
    { startLine: 1, endLine: 1 }
  ])("rejects invalid source range/context %j", (location) => {
    expect(
      reviewSchema.safeParse({
        ...fixture(),
        findings: [
          {
            id: "one",
            title: "Finding",
            deduction: 0,
            sourceLocation: { file: "Main.java", ...location }
          }
        ]
      }).success
    ).toBe(false);
  });
  it("rejects repeated finding IDs", () => {
    const finding = generalReview().findings[0];
    expect(
      reviewSchema.safeParse({ ...generalReview(), findings: [finding, finding] }).success
    ).toBe(false);
  });
  it("contains malformed JSON, unsupported versions and invalid schemas", () => {
    expect(parseReviewInput({ filename: "review.json", content: "{" })).toMatchObject({
      status: "invalid",
      diagnostics: [{ code: "malformed_json" }]
    });
    expect(
      parseReviewInput({ filename: "review.json", content: '{"schemaVersion":2}' })
    ).toMatchObject({
      status: "invalid",
      diagnostics: [
        { code: "unsupported_schema_version", message: expect.stringContaining("2") as unknown }
      ]
    });
    expect(
      parseReviewInput({
        filename: "review.json",
        content: fs.readFileSync(new URL("malformed-schema.json", fixtureDirectory), "utf8")
      }).status
    ).toBe("invalid");
  });
  it("keeps the exported JSON Schema generated from runtime Zod", () => {
    const artifact = JSON.parse(
      fs.readFileSync(new URL("../../../docs/review-v1.schema.json", import.meta.url), "utf8")
    ) as unknown;
    expect(artifact).toEqual(reviewJsonSchema());
  });
});

describe("matching and submission guards", () => {
  it("matches both authoritative identities and reports canonical repository/SHA", async () => {
    expect(await single()).toMatchObject({
      status: "ready",
      matchedStudent: { studentId: "jdoe", githubUsername: "jane-doe" },
      shaState: "exact",
      currentCommitSha: CURRENT_SHA
    });
  });
  it.each([{ githubUsername: "JANE-DOE" }, { studentId: "jdoe" }])(
    "allows one unique primary identity with approval: %j",
    async (student) => {
      const plan = await single({ ...fixture(), student });
      expect(plan.status).toBe("warning");
      expect(first(plan)).toMatchObject({ eligibleToApply: true, requiresApproval: true });
    }
  );
  it("does not override conflicting or unknown supplied identities", async () => {
    const ctx = context();
    const other = {
      ...required(ctx.submissions[0]),
      student: { githubUsername: "bob", studentId: "bsmith" }
    };
    expect(
      (
        await single(
          { ...fixture(), student: { githubUsername: "jane-doe", studentId: "bsmith" } },
          { ...ctx, submissions: [...ctx.submissions, other] }
        )
      ).diagnostics[0]?.code
    ).toBe("student_identity_conflict");
    expect(
      (
        await single({
          ...fixture(),
          student: { githubUsername: "jane-doe", studentId: "unknown" }
        })
      ).status
    ).toBe("invalid");
  });
  it("does not guess on ambiguous roster identity", async () => {
    const ctx = context();
    expect(
      (await single(fixture(), { ...ctx, submissions: [...ctx.submissions, ...ctx.submissions] }))
        .diagnostics[0]?.code
    ).toBe("ambiguous_student");
  });
  it("returns unmatched for no identity match", async () => {
    expect((await single(fixture("wrong-student"))).status).toBe("unmatched");
  });
  it.each(["courseCode", "termCode", "assignmentSlug"] as const)(
    "blocks wrong %s",
    async (field) => {
      expect(
        (await single({ ...fixture(), assignment: { ...fixture().assignment, [field]: "wrong" } }))
          .status
      ).toBe("invalid");
    }
  );
  it("blocks wrong recorded repository and wrong actual remote", async () => {
    expect(
      (await single({ ...fixture(), repository: { ...fixture().repository, owner: "wrong" } }))
        .diagnostics[0]?.code
    ).toBe("wrong_repository");
    expect(
      (
        await single(
          fixture(),
          context({ reader: reader({ matchesRepository: () => Promise.resolve(false) }) })
        )
      ).diagnostics[0]?.code
    ).toBe("wrong_repository");
  });
  it("does not trust a SHA from an unrelated history", async () => {
    const plan = await single(
      fixture(),
      context({ reader: reader({ isInHistory: () => Promise.resolve(false) }) })
    );
    expect(plan).toMatchObject({ status: "invalid", shaState: "unrelated" });
    expect(first(plan).eligibleToApply).toBe(false);
  });
  it.each([
    null,
    reader({ isInHistory: () => Promise.resolve(null) }),
    reader({ isInHistory: () => Promise.reject(new Error("/private/secret")) })
  ])("contains unavailable history safely", async (repository) => {
    const plan = await single(generalReview(), context({ reader: repository }));
    expect(plan).toMatchObject({ status: "warning", shaState: "unavailable" });
    expect(first(plan).eligibleToApply).toBe(false);
    expect(JSON.stringify(plan)).not.toContain("/private/secret");
  });
  it("blocks inconsistent persisted student/SHA and unavailable canonical SHA", async () => {
    const state = stateWithImport();
    expect(
      (await single(fixture(), context({ state: { ...state, studentId: "other" } }))).status
    ).toBe("invalid");
    expect(
      (await single(fixture(), context({ state: { ...state, submissionCommitSha: PREVIOUS_SHA } })))
        .status
    ).toBe("invalid");
    const ctx = context();
    expect(
      (
        await single(fixture(), {
          ...ctx,
          submissions: ctx.submissions.map((item) => ({ ...item, currentCommitSha: null }))
        })
      ).status
    ).toBe("invalid");
  });
});

describe("anchor verification and rubric mapping", () => {
  it("verifies exact file/line/excerpt and handles unanchored comments", async () => {
    const plan = await single();
    expect(first(plan).anchor.status).toBe("ready");
    expect(plan.findings[1]?.anchor.status).toBe("general");
    expect(first(plan).rubric).toMatchObject({ status: "exact", categoryId: "correctness" });
    expect(plan.findings[1]?.rubric.status).toBe("general");
  });
  it.each([
    ["missing file", null, "source_file_missing"],
    ["edited context", "different", "anchor_context_mismatch"],
    ["wrong line range", "short", "anchor_context_mismatch"]
  ])("does not trust %s", async (_, source, code) => {
    const plan = await single(
      fixture(),
      context({ reader: reader({ readRevisionFile: () => Promise.resolve(source) }) })
    );
    expect(first(plan)).toMatchObject({
      eligibleToApply: false,
      anchor: { status: "unresolved", diagnostics: [{ code }] }
    });
  });
  it("normalizes CRLF only, preserving exact spaces", async () => {
    expect(
      first(
        await single(
          fixture(),
          context({
            reader: reader({
              readRevisionFile: () => Promise.resolve(SOURCE.replaceAll("\n", "\r\n"))
            })
          })
        )
      ).anchor.status
    ).toBe("ready");
    expect(
      first(
        await single(
          fixture(),
          context({
            reader: reader({
              readRevisionFile: () => Promise.resolve(SOURCE.replace("    ", "  "))
            })
          })
        )
      ).anchor.status
    ).toBe("unresolved");
  });
  it("requires approval for unique same-file changed-SHA recovery", async () => {
    const review = fixture("changed-recoverable");
    const plan = await single(
      review,
      context({
        reader: reader({
          readRevisionFile: (sha) =>
            Promise.resolve(sha === PREVIOUS_SHA ? SOURCE : RECOVERED_SOURCE)
        })
      })
    );
    expect(plan).toMatchObject({ status: "warning", shaState: "changed" });
    expect(first(plan)).toMatchObject({
      eligibleToApply: true,
      recoveryRequired: true,
      requiresApproval: true,
      anchor: {
        status: "recoverable",
        original: { startLine: 2 },
        proposed: { startLine: 3, endLine: 3 }
      }
    });
    expect(plan.findings[1]).toMatchObject({
      eligibleToApply: true,
      recoveryRequired: true,
      anchor: { status: "general" }
    });
  });
  it.each([`${SOURCE}${SOURCE}`, "class Main {}", "    input.strip();"])(
    "blocks ambiguous or absent recovery",
    async (source) => {
      const plan = await single(
        fixture("changed-recoverable"),
        context({
          reader: reader({
            readRevisionFile: (sha) => Promise.resolve(sha === PREVIOUS_SHA ? SOURCE : source)
          })
        })
      );
      expect(first(plan)).toMatchObject({
        eligibleToApply: false,
        anchor: { status: "unresolved" }
      });
    }
  );
  it("verifies reviewed context before considering a current unique match", async () => {
    const plan = await single(
      fixture("changed-recoverable"),
      context({
        reader: reader({
          readRevisionFile: (sha) =>
            Promise.resolve(sha === PREVIOUS_SHA ? "wrong historical text" : SOURCE)
        })
      })
    );
    expect(first(plan).anchor.diagnostics[0]?.code).toBe("anchor_context_mismatch");
  });
  it("does not relocate an exact-SHA mismatch or whitespace-only anchor", async () => {
    expect(
      first(
        await single(
          fixture(),
          context({ reader: reader({ readRevisionFile: () => Promise.resolve(RECOVERED_SOURCE) }) })
        )
      ).anchor.status
    ).toBe("unresolved");
    const review = fixture();
    required(required(review.findings[0]).sourceLocation).excerpt = "   ";
    expect(first(await single(review)).anchor.diagnostics[0]?.code).toBe("anchor_context_missing");
  });
  it("supports unique exact label fallback with approval", async () => {
    const review = fixture();
    required(review.findings[0]).rubric = { name: "Correctness" };
    expect(first(await single(review))).toMatchObject({
      status: "warning",
      rubric: { status: "fallback", categoryId: "correctness" },
      eligibleToApply: true
    });
  });
  it("never falls back from an unknown stable ID", async () => {
    const review = fixture();
    required(review.findings[0]).rubric = { id: "unknown", name: "Correctness" };
    expect(first(await single(review))).toMatchObject({
      status: "invalid",
      rubric: { status: "unresolved" },
      eligibleToApply: false
    });
  });
  it("does not guess on ambiguous label or missing label", async () => {
    const review = fixture();
    required(review.findings[0]).rubric = { name: "Correctness" };
    const ctx = context();
    expect(
      first(
        await single(review, {
          ...ctx,
          rubric: [...ctx.rubric, { id: "other", name: "Correctness", points: 1 }]
        })
      ).rubric.diagnostics[0]?.code
    ).toBe("ambiguous_rubric_mapping");
    required(review.findings[0]).rubric = { name: "Unknown" };
    expect(first(await single(review)).eligibleToApply).toBe(false);
  });
  it("stable rubric ID wins over display-name drift with a warning", async () => {
    const review = fixture();
    required(review.findings[0]).rubric = { id: "correctness", name: "Old label" };
    expect(first(await single(review))).toMatchObject({
      status: "warning",
      rubric: { status: "exact" },
      requiresApproval: true
    });
  });
});

describe("idempotency and merge-only planning", () => {
  it("proposes only additive operations and preserves all existing state", async () => {
    const state = stateWithImport();
    const before = structuredClone(state);
    const plan = await single(fixture(), context({ state }));
    expect(state).toEqual(before);
    expect(first(plan)).toMatchObject({ duplicate: true, eligibleToApply: false, operation: null });
    expect(plan.findings[1]).toMatchObject({
      duplicate: false,
      operation: "add_comment",
      eligibleToApply: true
    });
    expect(validateGradingState(state).status).toBe("success");
  });
  it("persists provenance through normal manual edits and serialization", async () => {
    const edited = editAppliedComment(stateWithImport(), "imported", {
      title: "New title",
      text: "New text",
      deduction: 1
    });
    if (edited.status !== "success") throw new Error("Edit failed");
    const parsed = validateGradingState(JSON.parse(JSON.stringify(edited.value)) as unknown);
    if (parsed.status !== "success") throw new Error("Persistence failed");
    expect(first(await single(fixture(), context({ state: parsed.value }))).duplicate).toBe(true);
  });
  it("deduplicates by the review/finding pair, never text", async () => {
    const review = generalReview();
    const finding = required(review.findings[0]);
    review.findings.push({ ...finding, id: "different" });
    expect((await single(review)).findingCounts.ready).toBe(2);
    const otherReview = { ...fixture(), reviewId: "other-review" };
    expect(first(await single(otherReview, context({ state: stateWithImport() }))).duplicate).toBe(
      false
    );
    expect(reviewFindingKey("a:b", "c")).not.toBe(reviewFindingKey("a", "b:c"));
  });
  it("deduplicates repeated files within a batch deterministically", async () => {
    const review = generalReview();
    const plan = await planReviewImport(
      [reviewInput(review, "one.json"), reviewInput(review, "two.json")],
      context()
    );
    expect(plan.summary).toMatchObject({
      totalFiles: 2,
      ready: 1,
      duplicate: 1,
      eligibleFindings: 1
    });
    expect(plan).toEqual(
      await planReviewImport(
        [reviewInput(review, "one.json"), reviewInput(review, "two.json")],
        context()
      )
    );
  });
  it("ignores informational generator metadata when reserving duplicate keys", async () => {
    const review = generalReview();
    const plan = await planReviewImport(
      [
        reviewInput(review),
        reviewInput({
          ...review,
          generator: { name: "Different generator", version: "2" },
          createdAt: "2026-10-24T00:00:00Z"
        })
      ],
      context()
    );
    expect(plan.summary).toMatchObject({ ready: 1, duplicate: 1, invalid: 0, eligibleFindings: 1 });
  });
  it("blocks all conflicting reuse of a review ID in the same batch", async () => {
    const review = generalReview();
    const plan = await planReviewImport(
      [
        reviewInput(review),
        reviewInput({
          ...review,
          findings: [{ id: "different", title: "Different", deduction: 0 }]
        })
      ],
      context()
    );
    expect(plan.summary).toMatchObject({ invalid: 2, eligibleFindings: 0 });
  });
  it("allows zero findings without a proposed mutation", async () => {
    expect(await single({ ...fixture(), findings: [] })).toMatchObject({
      status: "ready",
      findings: []
    });
  });
});

describe("batch input boundary", () => {
  it("contains one malformed file and summarizes mixed statuses", async () => {
    const ready = { ...generalReview(), reviewId: "ready" };
    const warning = { ...generalReview(), reviewId: "warning", student: { studentId: "jdoe" } };
    const duplicate = { ...generalReview(), findings: [required(fixture().findings[0])] };
    const unmatched = {
      ...generalReview(),
      reviewId: "unknown",
      student: { studentId: "unknown" }
    };
    const plan = await planReviewImport(
      [
        reviewInput(ready),
        reviewInput(warning),
        reviewInput(duplicate),
        reviewInput(unmatched),
        { filename: "/private/secret/bad.json", content: "{" }
      ],
      context({ state: stateWithImport() })
    );
    expect(plan.summary).toMatchObject({
      totalFiles: 5,
      ready: 1,
      warning: 1,
      duplicate: 1,
      unmatched: 1,
      invalid: 1,
      eligibleFindings: 2
    });
    expect(plan.reviews[4]?.filename).toBe("bad.json");
    expect(JSON.stringify(plan)).not.toContain("/private/secret");
  });
  it("rejects oversized and non-JSON files independently", async () => {
    const plan = await planReviewImport(
      [
        { filename: "oversize.json", content: " ".repeat(MAX_REVIEW_FILE_BYTES + 1) },
        { filename: "review.js", content: JSON.stringify(fixture()) },
        reviewInput(fixture())
      ],
      context()
    );
    expect(plan.summary).toMatchObject({ totalFiles: 3, invalid: 2, ready: 1 });
    expect(plan.reviews[0]?.diagnostics[0]?.code).toBe("file_too_large");
  });
  it("counts UTF8 bytes and rejects excessive batches without processing any", async () => {
    expect(
      parseReviewInput({ filename: "large.json", content: "é".repeat(MAX_REVIEW_FILE_BYTES) })
    ).toMatchObject({ status: "invalid", diagnostics: [{ code: "file_too_large" }] });
    const inputs = Array.from({ length: MAX_REVIEW_FILES + 1 }, () => reviewInput(fixture()));
    const plan = await planReviewImport(inputs, context());
    expect(plan.summary).toMatchObject({
      totalFiles: MAX_REVIEW_FILES + 1,
      invalid: MAX_REVIEW_FILES + 1,
      eligibleFindings: 0
    });
    expect(plan.diagnostics[0]?.code).toBe("too_many_files");
  });
  it("rejects unsupported future versions without partial finding plans", async () => {
    const plan = await planReviewImport(
      [
        { filename: "future.json", content: JSON.stringify({ ...fixture(), schemaVersion: 2 }) },
        reviewInput(fixture())
      ],
      context()
    );
    expect(plan.reviews[0]).toMatchObject({ status: "invalid", findings: [] });
    expect(plan.reviews[1]?.status).toBe("ready");
  });
});
