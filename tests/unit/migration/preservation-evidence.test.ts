import { stringify } from "yaml";
import { putTerm, term, assignment, addManifest, manifestPath } from "./migration-fixtures.js";
import { describe, expect, it } from "vitest";
import { analyzeSchemaV1Migration } from "../../../src/migration/schema-v1-migration-analyzer.js";
import { validateMigrationReview } from "../../../src/migration/migration-review-validation.js";
import { reviewFixture, completeSubmission } from "./migration-review-fixtures.js";
import {
  historicalCourseReview,
  BasicCourse,
  MultiSectionCourse,
  HistoricalCourse,
  IncompleteCourse,
  ConflictCourse,
  gradingPath,
  commentPath,
  gradingRecord
} from "./synthetic-migration-fixtures.js";

const STUDENT_GITHUB_ID = 9901;
const REPLACEMENT_GITHUB_ID = 9902;
const SHA_LENGTH = 40;

describe("staged publication preservation evidence", () => {
  it("inventories roster facts and trusted IDs without replacing usernames or granting authority", () => {
    const input = BasicCourse({
      studentObservations: [
        {
          termCode: "27s1",
          studentId: "student001",
          githubUserId: STUDENT_GITHUB_ID,
          githubLogin: "fictional-renamed",
          reference: "verified-observation",
          provenance: "trusted-identity-evidence"
        }
      ]
    });
    const report = analyzeSchemaV1Migration(input);
    expect(report.preservation.students[0]).toMatchObject({
      studentId: "student001",
      githubUsername: "student-001",
      identityState: "observed",
      observations: [{ githubUserId: STUDENT_GITHUB_ID }]
    });
    expect(
      report.provisionalFacultyDirectory.value.some(
        (entry) => entry.github_user_id === STUDENT_GITHUB_ID
      )
    ).toBe(false);
    expect(analyzeSchemaV1Migration(BasicCourse()).preservation.students[0]?.identityState).toBe(
      "unknown"
    );
  });
  it("preserves grading decisions, exact placement and independent applied snapshots", () => {
    const report = analyzeSchemaV1Migration(BasicCourse());
    expect(report.preservation.grading[0]).toMatchObject({
      state: "loaded",
      targetId: "student001",
      sectionPlacement: "exact",
      sectionIds: ["001"],
      selectedCommit: gradingRecord().submissionCommitSha,
      commitReachability: "unknown",
      appliedSnapshots: gradingRecord().appliedComments
    });
    expect(report.preservation.comments[0]?.state).toBe("missing");
  });
  it.each(["{broken", JSON.stringify({ ...gradingRecord(), status: "invalid" })])(
    "preserves damaged data as deferred Needs attention: %s",
    (content) => {
      const input = BasicCourse({ sourceFiles: { [gradingPath]: content } });
      const report = analyzeSchemaV1Migration(input);
      expect(report.status).not.toBe("blocked");
      expect(report.preservation.grading[0]).toMatchObject({
        state: "invalid",
        originalText: content,
        classification: "unresolved"
      });
      const context = reviewFixture(input);
      const review = validateMigrationReview(context, completeSubmission(context));
      expect(review.status).toBe("complete");
      expect(review.preservation).toEqual(report.preservation);
      expect(review.publicationReady).toBe(false);
    }
  );
  it("does not erase critical blockers when grading is damaged", () => {
    const input = ConflictCourse({ sourceFiles: { [gradingPath]: "{broken" } });
    expect(analyzeSchemaV1Migration(input).status).toBe("blocked");
  });
  it.each([
    undefined,
    "{broken",
    JSON.stringify({
      schemaVersion: 1,
      comments: [
        {
          id: "one",
          title: "Example",
          text: "Fictional text",
          defaultDeduction: -2,
          tags: ["Style"]
        }
      ]
    })
  ])("preserves missing/invalid/valid comment libraries and unknown ownership", (content) => {
    const report = analyzeSchemaV1Migration(
      BasicCourse({ sourceFiles: content === undefined ? {} : { [commentPath]: content } })
    );
    const library = report.preservation.comments[0];
    expect(library?.state).toBe(
      content === undefined ? "missing" : content === "{broken" ? "invalid" : "loaded"
    );
    expect(library?.ownership).toBe("unknown");
    expect(library?.history).toBe("unknown");
    if (content) expect(library?.originalText).toBe(content);
  });
  it("never guesses an unmapped target", () => {
    const report = analyzeSchemaV1Migration(
      BasicCourse({
        sourceFiles: { [gradingPath]: JSON.stringify({ ...gradingRecord(), studentId: "unknown" }) }
      })
    );
    expect(report.preservation.grading[0]?.sectionPlacement).toBe("unmapped");
  });
  it("retains conflicting individual roster/manifest placement without selecting a section", () => {
    const input = MultiSectionCourse();
    addManifest(input, (manifest) => {
      const first = manifest.repositories[0];
      if (first) first.section = "002";
    });
    expect(analyzeSchemaV1Migration(input).preservation.grading[0]?.sectionPlacement).toBe(
      "ambiguous"
    );
  });
  it.each([false, true])(
    "inventories group membership and cross-section ambiguity: %s",
    (crossSection) => {
      const input = MultiSectionCourse();
      putTerm(input, term, [{ ...assignment, repository_mode: "group" }]);
      const groupPath = gradingPath.replace("student001", "group-a");
      input.sourceFiles = {
        ...input.sourceFiles,
        [groupPath]: JSON.stringify({ ...gradingRecord(), studentId: "group-a" }),
        [manifestPath]: stringify({
          schema_version: 2,
          repository_mode: "group",
          targets: [
            {
              target_id: "group-a",
              mode: "group",
              group_id: "a",
              repository_name: "fictional-group-repo",
              lifecycle_status: "active",
              section_ids: ["001"],
              student_ids: crossSection ? ["student001", "student002"] : ["student001"],
              github_usernames: ["student-001"],
              diagnostics: []
            }
          ],
          student_mappings: [],
          diagnostics: []
        })
      };
      const group = analyzeSchemaV1Migration(input).preservation.grading.find(
        (entry) => entry.targetId === "group-a"
      );
      expect(group?.targetKind).toBe("group");
      expect(group?.sectionPlacement).toBe(crossSection ? "cross_section" : "exact");
    }
  );
  it("separates runtime/source provenance and preserves available reports without claiming publication", () => {
    const reportPath = "terms/27s1/reports/lab04/students/001/student001.md";
    const input = BasicCourse({
      runtimeFiles: {
        [gradingPath]: JSON.stringify({ ...gradingRecord(), status: "published" }),
        [reportPath]: "fictional report"
      }
    });
    const report = analyzeSchemaV1Migration(input);
    expect(report.preservation.grading.map((entry) => entry.provenance)).toEqual([
      "source",
      "runtime"
    ]);
    expect(report.preservation.grading[1]).toMatchObject({
      recordedStatus: "published",
      publicationVerification: "unknown",
      classification: "unresolved"
    });
    expect(report.preservation.artifacts[0]).toMatchObject({
      location: reportPath,
      provenance: "runtime",
      originalText: "fictional report"
    });
    const changed = BasicCourse({ runtimeFiles: { [gradingPath]: "changed" } });
    expect(analyzeSchemaV1Migration(changed).reportId).not.toBe(report.reportId);
  });
  it("retains disagreeing source/runtime grading copies without selecting a winner", () => {
    const input = BasicCourse({
      runtimeFiles: {
        [gradingPath]: JSON.stringify({
          ...gradingRecord(),
          submissionCommitSha: "f".repeat(SHA_LENGTH)
        })
      }
    });
    const report = analyzeSchemaV1Migration(input);
    expect(report.preservation.grading).toHaveLength(2);
    expect(
      report.preservation.grading.every((entry) => entry.classification === "unresolved")
    ).toBe(true);
    expect(report.issues.some((entry) => entry.code === "grading_copies_conflict")).toBe(true);
  });
  it("retains invalid and conflicting ID observations without promoting them", () => {
    const base = {
      termCode: "27s1",
      studentId: "student001",
      githubLogin: "fictional-student",
      reference: "verified",
      provenance: "trusted-identity-evidence" as const
    };
    for (const ids of [[0], [STUDENT_GITHUB_ID, REPLACEMENT_GITHUB_ID]]) {
      const report = analyzeSchemaV1Migration(
        BasicCourse({ studentObservations: ids.map((githubUserId) => ({ ...base, githubUserId })) })
      );
      expect(report.preservation.students[0]?.identityState).toBe("ambiguous");
      expect(report.status).not.toBe("blocked");
      expect(report.preservation.studentObservations).toHaveLength(ids.length);
    }
  });
  it("retains duplicate library IDs as invalid raw evidence", () => {
    const comment = {
      id: "same",
      title: "Fictional",
      text: "Example",
      defaultDeduction: 0,
      tags: []
    };
    const raw = JSON.stringify({ schemaVersion: 1, comments: [comment, comment] });
    expect(
      analyzeSchemaV1Migration(BasicCourse({ sourceFiles: { [commentPath]: raw } })).preservation
        .comments[0]
    ).toMatchObject({ state: "invalid", originalText: raw });
  });
  it("blocks inconsistent original-byte evidence rather than pretending preservation succeeded", () => {
    const input = BasicCourse();
    input.sourceBytesBase64 = { [gradingPath]: Buffer.from("different bytes").toString("base64") };
    const analysis = analyzeSchemaV1Migration(input);
    expect(analysis.status).toBe("blocked");
    expect(
      analysis.issues.some(
        (issue) =>
          issue.code === "preservation_integrity_failure" && issue.classification === "blocking"
      )
    ).toBe(true);
  });
  it("supports archived-term review and historical authority without inventing v1 history", () => {
    const scenario = historicalCourseReview();
    const review = validateMigrationReview(scenario.context, scenario.submission);
    expect(review.status).toBe("complete");
    expect(review.terms[0]).toMatchObject({ status: "archived", hasEverBeenActive: true });
    expect(review.terms[0]?.sections[0]?.currentFacultyGithubUserIds).toHaveLength(1);
    expect(review.preservation.grading).toHaveLength(1);
  });
  it("cannot clear prior activity established by valid source grading", () => {
    const context = reviewFixture(BasicCourse());
    expect(context.analysis.terms[0]?.lifecycle.hasEverBeenActive.value).toBe(true);
    const submitted = completeSubmission(context);
    const review = validateMigrationReview(context, {
      ...submitted,
      terms: submitted.terms.map((entry) => ({ ...entry, hasEverBeenActive: false }))
    });
    expect(review.status).toBe("blocked");
    const localOnly = BasicCourse({
      runtimeFiles: { [gradingPath]: JSON.stringify(gradingRecord()) }
    });
    localOnly.sourceFiles = Object.fromEntries(
      Object.entries(localOnly.sourceFiles).filter(([file]) => file !== gradingPath)
    );
    expect(
      analyzeSchemaV1Migration(localOnly).terms[0]?.lifecycle.hasEverBeenActive.value
    ).toBeNull();
  });
  it("is deterministic, deeply immutable, detached and bound to all evidence", () => {
    const input = BasicCourse();
    const before = structuredClone(input);
    const report = analyzeSchemaV1Migration(input);
    expect(input).toEqual(before);
    expect(analyzeSchemaV1Migration(input)).toEqual(report);
    expect(Object.isFrozen(report.preservation.grading[0]?.appliedSnapshots)).toBe(true);
    expect(() => {
      (report.preservation.grading as unknown[]).push({});
    }).toThrow();
    const changed = BasicCourse({ sourceSha: "f".repeat(SHA_LENGTH) });
    expect(analyzeSchemaV1Migration(changed).reportId).not.toBe(report.reportId);
    changed.binding.sourceCommitSha = input.binding.sourceCommitSha;
    changed.sourceFiles = { ...input.sourceFiles, [gradingPath]: "damaged" };
    expect(analyzeSchemaV1Migration(changed).reportId).not.toBe(report.reportId);
  });
  it.each([BasicCourse, MultiSectionCourse, HistoricalCourse, IncompleteCourse])(
    "provides composable nonblocking synthetic scenarios",
    (builder) => {
      expect(analyzeSchemaV1Migration(builder()).status).not.toBe("blocked");
    }
  );
});
