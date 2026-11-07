import fs from "node:fs";
import ts from "typescript";
import fsPromises from "node:fs/promises";
import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { parse, stringify } from "yaml";
import { describe, expect, it, vi } from "vitest";
import {
  buildMigrationCandidate,
  STAGED_PHASE_9_BOUNDARY
} from "../../../src/migration/migration-candidate.js";
import {
  migrationAssignmentSchema,
  migrationSectionSchema,
  migrationMetadataSchema,
  serializeMigrationYaml
} from "../../../src/migration/migration-candidate-schemas.js";
import {
  rawCourseConfigV2Schema,
  rawCourseConfigV1Schema,
  rawTermConfigV2Schema,
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION
} from "../../../src/config/config-schemas.js";
import type { MigrationSnapshot } from "../../../src/migration/migration-models.js";
import {
  BasicCourse,
  MultiSectionCourse,
  HistoricalCourse,
  IncompleteCourse,
  ConflictCourse,
  completeSyntheticMigration,
  gradingPath,
  commentPath,
  gradingRecord
} from "./synthetic-migration-fixtures.js";
import {
  addManifest,
  manifestPath,
  assignment,
  putTerm,
  term,
  OTHER_USER_ID
} from "./migration-fixtures.js";
import { planGraderRemoval } from "../../../src/migration/grader-removal-planner.js";
import { reviewGraderAccess } from "../../../src/migration/grader-access-review.js";
import type { LegacyGraderInventoryData } from "../../../src/migration/legacy-grader-models.js";

const assignmentPath = "terms/27s1/assignments/lab04/assignment.yml";
const sectionPath = "terms/27s1/assignments/lab04/sections/001.yml";
const metadataPath = ".graider/migration.json";
const ASSIGNMENT_POINTS = 100;
const LEGACY_TEAM_ID = 9900;
const SHA_LENGTH = 40;
const required = <T>(value: T | null | undefined): T => {
  if (value === undefined || value === null) throw new Error("Missing fixture value.");
  return value;
};
const setup = (input = BasicCourse(), statuses?: readonly ("draft" | "active" | "archived")[]) => {
  const artifacts = completeSyntheticMigration(input, statuses);
  const build = () => buildMigrationCandidate({ ...artifacts, boundary: STAGED_PHASE_9_BOUNDARY });
  return { artifacts, build };
};
const file = (candidate: ReturnType<typeof buildMigrationCandidate>, path: string) =>
  required(candidate.files.find((entry) => entry.path === path));
const frozen = (value: unknown): void => {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
};

describe("pure staged v2 migration candidate", () => {
  it("contains the complete source set, canonical v2 files and exact reviewed authority", () => {
    const input = BasicCourse({
      sourceFiles: { "notes/teaching.txt": "Unrelated valid data\r\n" }
    });
    const legacyCourse = rawCourseConfigV1Schema.parse(
      parse(required(input.sourceFiles["course.yml"]))
    );
    legacyCourse.github.grader_team = "obsolete-graders";
    legacyCourse.github.grader_permission = "push";
    input.sourceFiles = { ...input.sourceFiles, "course.yml": stringify(legacyCourse) };
    const { build, artifacts } = setup(input, ["active"]);
    const candidate = build();
    expect(candidate.status).not.toBe("blocked");
    expect(candidate.publicationReady).toBe(false);
    expect(candidate.source).toEqual(artifacts.review.source);
    for (const path of Object.keys(input.sourceFiles))
      expect(candidate.files.some((entry) => entry.path === path)).toBe(true);
    const course = rawCourseConfigV2Schema.parse(parse(file(candidate, "course.yml").content));
    expect(course.course).toMatchObject({
      repository_id: input.binding.repositoryId,
      lifecycle: "unarchived",
      term_creation_order: ["27s1"],
      organization_binding: {
        organization_id: input.binding.organizationId,
        organization_login: input.binding.organizationLogin
      }
    });
    expect(course.faculty_directory).toEqual(artifacts.review.facultyDirectory);
    expect(course.github).not.toHaveProperty("grader_team");
    expect(course.github).not.toHaveProperty("grader_permission");
    expect(
      required(candidate.audit.originalFiles.find((entry) => entry.path === "course.yml")).content
    ).toContain("obsolete-graders");
    expect(course.fallback_administrator.github_user_id).toBe(
      artifacts.review.fallbackAdministratorGithubUserId
    );
    const reviewedTerm = rawTermConfigV2Schema.parse(
      parse(file(candidate, "terms/27s1/term.yml").content)
    );
    expect(reviewedTerm.term).toMatchObject({ status: "active", has_ever_been_active: true });
    expect(reviewedTerm.coordinators).toEqual({
      current: [{ github_user_id: artifacts.review.fallbackAdministratorGithubUserId }],
      former: []
    });
    expect(reviewedTerm.sections[0]?.faculty.former).toEqual([]);
    expect(file(candidate, "notes/teaching.txt").content).toBe("Unrelated valid data\r\n");
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });

  it.each([
    ["draft", "draft"],
    ["archived", "draft"],
    ["archived", "active"],
    ["archived", "archived"]
  ] as const)(
    "retains lifecycle combinations %s / %s and reviewed creation order",
    (first, second) => {
      const input = MultiSectionCourse();
      const f = setup(input, [first, second]);
      // The review fixture explicitly confirms reverse presentation order.
      expect(f.artifacts.review.termCreationOrder).toEqual(["27s1", "26s2"]);
      const candidate = f.build();
      expect(candidate.status).not.toBe("blocked");
      const course = rawCourseConfigV2Schema.parse(parse(file(candidate, "course.yml").content));
      expect(course.course.term_creation_order).toEqual(["27s1", "26s2"]);
      expect(
        rawTermConfigV2Schema.parse(parse(file(candidate, "terms/26s2/term.yml").content)).term
          .status
      ).toBe(first);
      expect(
        rawTermConfigV2Schema.parse(parse(file(candidate, "terms/27s1/term.yml").content)).term
          .status
      ).toBe(second);
    }
  );

  it("supports zero terms and preserves unknown earlier faculty/role history without invented intervals", () => {
    const input = BasicCourse();
    input.sourceFiles = { "course.yml": required(input.sourceFiles["course.yml"]) };
    const candidate = setup(input).build();
    expect(candidate.status).not.toBe("blocked");
    expect(
      rawCourseConfigV2Schema.parse(parse(file(candidate, "course.yml").content)).course
        .term_creation_order
    ).toEqual([]);
    const historical = setup(HistoricalCourse(), ["archived"]).build();
    const metadata = migrationMetadataSchema.parse(
      JSON.parse(file(historical, metadataPath).content)
    );
    expect(metadata.role_history).toBe("earlier-history-unavailable");
    expect(file(historical, "terms/27s1/term.yml").content).not.toMatch(
      /observed_at|from:|until:|end_reason/
    );
  });

  it("materializes assignment owners and section schedules without future revision or template choices", () => {
    const candidate = setup().build();
    const shared = migrationAssignmentSchema.parse(parse(file(candidate, assignmentPath).content));
    expect(shared.assignment.owners).toHaveLength(1);
    expect(shared.assignment.lifecycle).toBe("active");
    expect(shared).not.toHaveProperty("sections");
    expect(shared).not.toHaveProperty("deadline");
    expect(shared.grading).toEqual(assignment.grading);
    expect(shared).not.toHaveProperty("revision");
    const section = migrationSectionSchema.parse(parse(file(candidate, sectionPath).content));
    expect(section.schedule).toEqual(assignment.deadline);
    expect(section.usage).toBe("available");
    expect(section.provisioning).toBe("not_observed");
    expect(section).not.toHaveProperty("applied_revision");
  });

  it("preserves validated configuration and missing deadlines without assigning defaults", () => {
    const input = BasicCourse();
    const task = structuredClone(assignment);
    task.sections = ["001"];
    delete task.deadline;
    task.metadata = {
      ...task.metadata,
      lms_assignment_id: "course-work",
      points: ASSIGNMENT_POINTS,
      grading_category: "Labs"
    };
    task.template = { repository: "fictional-academy/template", branch: "main" };
    putTerm(input, { ...term, sections: [required(term.sections[0])] }, [task]);
    const candidate = setup(input).build();
    const course = rawCourseConfigV2Schema.parse(parse(file(candidate, "course.yml").content));
    const original = required(setup(input).artifacts.analysis.courseConfigurationEvidence).value;
    expect(course.reports).toEqual(original.reports);
    expect(course.grading).toEqual(original.grading);
    expect(course.defaults).toEqual(original.defaults);
    const shared = migrationAssignmentSchema.parse(parse(file(candidate, assignmentPath).content));
    expect(shared.template).toEqual(task.template);
    expect(shared.metadata).toMatchObject({
      lms_assignment_id: "course-work",
      points: ASSIGNMENT_POINTS,
      grading_category: "Labs"
    });
    expect(shared.metadata).not.toHaveProperty("faculty_owner");
    expect(
      migrationSectionSchema.parse(parse(file(candidate, sectionPath).content)).schedule
    ).toBeNull();
  });

  it("retains faculty rename history and only explicit grader-review section additions", () => {
    const input = MultiSectionCourse();
    input.trustedIdentities =
      input.trustedIdentities?.map((entry) => ({
        ...entry,
        githubLoginHistory: [`old-${entry.institutionalUsername}`]
      })) ?? [];
    const { artifacts } = setup(input, ["archived", "active"]);
    const inventory = structuredClone(
      artifacts.graderRemovalPlan.audit.inventory
    ) as LegacyGraderInventoryData;
    inventory.status = "ready";
    inventory.candidate = {
      classification: "legacy_candidate",
      organizationId: required(input.binding.organizationId),
      organizationLogin: input.binding.organizationLogin,
      teamId: LEGACY_TEAM_ID,
      slug: "legacy-graders",
      membershipComplete: true,
      members: [{ id: OTHER_USER_ID, login: "github-smith" }]
    };
    const access = reviewGraderAccess(
      { inventoryId: "explicit-access-review", inventory, review: artifacts.review },
      {
        inventoryId: "explicit-access-review",
        decisions: [
          {
            githubUserId: OTHER_USER_ID,
            disposition: "assign",
            sections: [{ termCode: "27s1", sectionId: "002" }]
          }
        ]
      }
    );
    const removal = planGraderRemoval(
      artifacts.analysis,
      artifacts.review,
      artifacts.assignmentPlan,
      inventory,
      access
    );
    const candidate = buildMigrationCandidate({
      ...artifacts,
      graderRemovalPlan: removal,
      boundary: STAGED_PHASE_9_BOUNDARY
    });
    expect(candidate.status).not.toBe("blocked");
    const course = rawCourseConfigV2Schema.parse(parse(file(candidate, "course.yml").content));
    expect(course.faculty_directory.every((entry) => entry.github_login_history.length === 1)).toBe(
      true
    );
    const reviewedTerm = rawTermConfigV2Schema.parse(
      parse(file(candidate, "terms/27s1/term.yml").content)
    );
    expect(
      reviewedTerm.sections.find((entry) => entry.id === "002")?.faculty.current
    ).toContainEqual({ github_user_id: OTHER_USER_ID });
    expect(reviewedTerm.sections.every((entry) => entry.faculty.former.length === 0)).toBe(true);
    expect(course.github).not.toHaveProperty("grader_team");
  });

  it("keeps ownerless assignments repair-required and legacy closed unresolved", () => {
    const input = BasicCourse();
    const task = {
      ...assignment,
      sections: ["001"],
      metadata: { points: ASSIGNMENT_POINTS },
      assignment: { ...assignment.assignment, status: "closed" }
    };
    putTerm(input, { ...term, sections: [required(term.sections[0])] }, [task]);
    const candidate = setup(input).build();
    const shared = migrationAssignmentSchema.parse(parse(file(candidate, assignmentPath).content));
    expect(shared.assignment.owners).toEqual([]);
    expect(shared.assignment.lifecycle).toBeNull();
    expect(shared.migration).toMatchObject({
      owner_repair_required: true,
      legacy_status: "closed",
      state: "needs_attention"
    });
    expect(shared.metadata?.points).toBe(ASSIGNMENT_POINTS);
    expect(candidate.status).toBe("needs_attention");
  });

  it("preserves successful repositories and original manifest provenance during partial Apply and removes grader desired state", () => {
    const input = MultiSectionCourse();
    addManifest(input, (manifest) => {
      required(manifest.operation_history[0]).status = "failure";
    });
    const candidate = setup(input).build();
    expect(candidate.status).toBe("needs_attention");
    const section = migrationSectionSchema.parse(parse(file(candidate, sectionPath).content));
    expect(section.provisioning).toBe("partial_incomplete");
    const cleaned = parse(file(candidate, manifestPath).content) as {
      repositories: Array<{ repository: { id: number }; permissions: Record<string, unknown> }>;
      source: unknown;
      operation_history: unknown;
    };
    const original = parse(required(input.sourceFiles[manifestPath])) as typeof cleaned;
    expect(cleaned.repositories.map((entry) => entry.repository)).toEqual(
      original.repositories.map((entry) => entry.repository)
    );
    expect(cleaned.source).toEqual(original.source);
    expect(cleaned.operation_history).toEqual(original.operation_history);
    cleaned.repositories.forEach((entry) => {
      expect(entry.permissions).not.toHaveProperty("grader_team");
    });
    expect(candidate.audit.graderRemovalPlan.audit.evidence.length).toBeGreaterThan(0);
    expect(
      candidate.audit.originalFiles.find((entry) => entry.path === manifestPath)?.content
    ).toBe(input.sourceFiles[manifestPath]);
  });

  it("retains complete manifest records, template baselines and source anchors except removed desired grader permissions", () => {
    const input = MultiSectionCourse();
    addManifest(input, (manifest) => {
      Object.assign(required(manifest.repositories[0]).repository, {
        template_repository: "fictional-academy/template",
        template_commit_sha: "e".repeat(SHA_LENGTH),
        student_default_branch_commit_sha: "f".repeat(SHA_LENGTH),
        template_sync_baseline_status: "initialized"
      });
    });
    const candidate = setup(input).build();
    const expected = parse(required(input.sourceFiles[manifestPath])) as {
      repositories: Array<{ permissions: { grader_team?: unknown } }>;
    };
    expected.repositories.forEach((entry) => {
      delete entry.permissions.grader_team;
    });
    expect(parse(file(candidate, manifestPath).content)).toEqual(expected);
    expect(
      migrationSectionSchema.parse(parse(file(candidate, sectionPath).content)).provisioning
    ).toBe("complete_evidence");
  });

  it("preserves runtime-only manifests and conflicting copies without promoting them to source", () => {
    const input = MultiSectionCourse();
    addManifest(input);
    const manifest = required(input.sourceFiles[manifestPath]);
    input.sourceFiles = Object.fromEntries(
      Object.entries(input.sourceFiles).filter(([path]) => path !== manifestPath)
    );
    input.runtime = { coverage: "machine_local", files: { [manifestPath]: manifest } };
    const candidate = setup(input).build();
    expect(candidate.status).not.toBe("blocked");
    expect(candidate.files.find((entry) => entry.path === manifestPath)).toBeUndefined();
    expect(candidate.audit.runtimeFiles.find((entry) => entry.path === manifestPath)?.content).toBe(
      manifest
    );
    expect(
      migrationSectionSchema
        .parse(parse(file(candidate, sectionPath).content))
        .manifest_evidence.some((entry) => entry.provenance === "runtime")
    ).toBe(true);
  });

  it("preserves damaged source bytes and all deferred runtime evidence without relocation or false publication", () => {
    const runtimeText = JSON.stringify({ ...gradingRecord(), status: "published" });
    const bytes = Buffer.from("//57", "base64");
    const input = IncompleteCourse({
      sourceFiles: {
        [gradingPath]: bytes.toString("utf8"),
        [commentPath]: '{"duplicate":"unrepaired"}'
      },
      runtimeFiles: { [gradingPath]: runtimeText }
    });
    input.sourceBytesBase64 = { [gradingPath]: bytes.toString("base64") };
    const candidate = setup(input).build();
    expect(candidate.status).toBe("needs_attention");
    expect(file(candidate, gradingPath).bytesBase64).toBe(bytes.toString("base64"));
    expect(file(candidate, gradingPath).sha256).toBe(
      createHash("sha256").update(bytes).digest("hex")
    );
    expect(file(candidate, commentPath).content).toBe(input.sourceFiles[commentPath]);
    expect(candidate.preservation.grading).toHaveLength(2);
    expect(
      candidate.preservation.grading.find((entry) => entry.provenance === "runtime")
    ).toMatchObject({
      originalText: runtimeText,
      publicationVerification: "unknown",
      sectionPlacement: "exact"
    });
    expect(candidate.files.some((entry) => entry.path.startsWith("terms/27s1/grading/"))).toBe(
      false
    );
    const metadata = file(candidate, metadataPath).content;
    expect(metadata).not.toContain("Fictional snapshot");
    expect(metadata).toContain("unknown");
    expect(metadata).toContain("Phase 14");
  });

  it("preserves ambiguous individual/group placement and student observations as deferred evidence", () => {
    const input = MultiSectionCourse({
      studentObservations: [
        {
          termCode: "27s1",
          studentId: "student001",
          githubUserId: OTHER_USER_ID,
          githubLogin: "student-renamed",
          reference: "observed-only",
          provenance: "trusted-identity-evidence"
        }
      ]
    });
    addManifest(input, (manifest) => {
      required(manifest.repositories[0]).section = "002";
    });
    const rosterPath = "terms/27s1/rosters/002.csv";
    const candidate = setup(input).build();
    expect(candidate.status).not.toBe("blocked");
    expect(
      candidate.preservation.grading.find((entry) => entry.location === gradingPath)
        ?.sectionPlacement
    ).toBe("ambiguous");
    expect(file(candidate, gradingPath).content).toBe(input.sourceFiles[gradingPath]);
    const metadata = migrationMetadataSchema.parse(
      JSON.parse(file(candidate, metadataPath).content)
    );
    expect(metadata.student_observations).toEqual(input.studentObservations);
    expect(metadata.student_identity).toBe("preserved-evidence-only-phase-13");
    expect(file(candidate, rosterPath).content).toBe(input.sourceFiles[rosterPath]);
  });

  it("preserves cross-section group grading without selecting a canonical section or repairing membership", () => {
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
            student_ids: ["student001", "student002"],
            github_usernames: ["student-001"],
            diagnostics: []
          }
        ],
        student_mappings: [],
        diagnostics: []
      })
    };
    const candidate = setup(input).build();
    expect(candidate.status).not.toBe("blocked");
    expect(
      candidate.preservation.grading.find((entry) => entry.targetId === "group-a")
    ).toMatchObject({
      targetKind: "group",
      sectionPlacement: "cross_section",
      sectionIds: ["001", "002"]
    });
    expect(file(candidate, groupPath).content).toBe(input.sourceFiles[groupPath]);
    expect(file(candidate, manifestPath).content).toBe(input.sourceFiles[manifestPath]);
    expect(candidate.files.some((entry) => entry.path.includes("/grading/lab04/sections/"))).toBe(
      false
    );
  });

  it("is detached, deeply immutable and byte deterministic across key order and repeated calls", () => {
    const input = BasicCourse();
    const a = setup(input).build();
    const reordered: MigrationSnapshot = {
      ...input,
      sourceFiles: Object.fromEntries(Object.entries(input.sourceFiles).reverse())
    };
    const b = setup(reordered).build();
    expect(a).toEqual(b);
    frozen(a);
    expect(setup(input).build()).toEqual(a);
    const before = JSON.stringify(a);
    (input.sourceFiles as Record<string, string>)["notes/new.txt"] = "later change";
    expect(JSON.stringify(a)).toBe(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(a.files.map((entry) => entry.path)).toEqual(
      [...a.files.map((entry) => entry.path)].sort()
    );
  });

  it("preserves invalid manifests as evidence without fabricating repaired content", () => {
    const input = IncompleteCourse({ sourceFiles: { [manifestPath]: "{damaged grader evidence" } });
    const candidate = setup(input).build();
    expect(candidate.status).not.toBe("blocked");
    expect(file(candidate, manifestPath)).toMatchObject({
      kind: "preserved",
      content: input.sourceFiles[manifestPath]
    });
    expect(
      migrationMetadataSchema.parse(JSON.parse(file(candidate, metadataPath).content)).evidence
    ).toContainEqual(
      expect.objectContaining({
        kind: "manifest",
        state: "invalid",
        handling: "original-retained-in-place"
      })
    );
  });

  it("rejects inconsistent bytes for unrelated files and extra byte-only inventory entries", () => {
    for (const sourceBytesBase64 of [
      { "notes/evidence.txt": Buffer.from("different").toString("base64") },
      { "notes/absent.txt": Buffer.from("unlisted").toString("base64") },
      { constructor: Buffer.from("unlisted").toString("base64") }
    ]) {
      const input = BasicCourse({ sourceFiles: { "notes/evidence.txt": "original" } });
      input.sourceBytesBase64 = sourceBytesBase64;
      expect(setup(input).build().status).toBe("blocked");
    }
  });

  it("preserves valid unrelated filenames that resemble object prototype keys", () => {
    const input = BasicCourse({
      sourceFiles: { constructor: "valid unrelated file", toString: "another file" }
    });
    input.sourceBytesBase64 = {
      [gradingPath]: Buffer.from(required(input.sourceFiles[gradingPath])).toString("base64")
    };
    const candidate = setup(input).build();
    expect(candidate.status).not.toBe("blocked");
    expect(file(candidate, "constructor").content).toBe("valid unrelated file");
    expect(file(candidate, "toString").content).toBe("another file");
  });

  it.each([
    "/absolute",
    "C:/absolute",
    "notes\\windows.txt",
    "notes/../escape",
    "notes/CON.txt",
    "notes/trailing.",
    "notes/trailing ",
    "notes/aux",
    "notes/COM1.yml",
    "notes/control\u0000",
    ".git/config"
  ])("rejects nonportable output path %s", (path) => {
    const candidate = setup(BasicCourse({ sourceFiles: { [path]: "unsafe" } })).build();
    expect(candidate.status).toBe("blocked");
    expect(candidate.files).toEqual([]);
  });

  it("rejects path aliases, generated-file collisions and nonportable reviewed sections", () => {
    for (const extra of [
      { "notes/File.txt": "one", "notes/file.txt": "two" },
      { [metadataPath]: "existing unrelated content" },
      { notes: "file", "notes/child": "collision" }
    ]) {
      expect(setup(BasicCourse({ sourceFiles: extra })).build().status).toBe("blocked");
    }
    const input = BasicCourse();
    const sectionId = "CON";
    putTerm(input, { ...term, sections: [{ id: sectionId, faculty: ["jones"] }] }, [
      { ...assignment, sections: [sectionId] }
    ]);
    expect(setup(input).build().status).toBe("blocked");
  });

  it("rejects changed source, review, preservation, inventory, plan and boundary bindings", () => {
    const { artifacts } = setup();
    const alterations = [
      {
        analysis: {
          ...artifacts.analysis,
          source: { ...artifacts.analysis.source, repositoryId: OTHER_USER_ID }
        }
      },
      {
        snapshot: {
          ...artifacts.snapshot,
          sourceFiles: { ...artifacts.snapshot.sourceFiles, "notes/changed.txt": "unreviewed" }
        }
      },
      {
        snapshot: {
          ...artifacts.snapshot,
          runtime: {
            ...artifacts.snapshot.runtime,
            files: { "notes/changed.txt": "unreviewed runtime" }
          }
        }
      },
      {
        review: { ...artifacts.review, source: { ...artifacts.review.source, reportId: "wrong" } }
      },
      {
        review: {
          ...artifacts.review,
          preservation: { ...artifacts.review.preservation, grading: [] }
        }
      },
      { assignmentPlan: { ...artifacts.assignmentPlan, assignments: [] } },
      { graderRemovalPlan: { ...artifacts.graderRemovalPlan, facultyTerms: [] } },
      {
        graderRemovalPlan: {
          ...artifacts.graderRemovalPlan,
          audit: {
            ...artifacts.graderRemovalPlan.audit,
            inventory: {
              ...artifacts.graderRemovalPlan.audit.inventory,
              source: {
                ...artifacts.graderRemovalPlan.audit.inventory.source,
                sourceCommitSha: "wrong"
              }
            }
          }
        }
      },
      { boundary: { ...STAGED_PHASE_9_BOUNDARY, decision: "B" } }
    ];
    for (const changed of alterations) {
      const candidate = buildMigrationCandidate({
        ...artifacts,
        boundary: STAGED_PHASE_9_BOUNDARY,
        ...changed
      });
      expect(candidate.status).toBe("blocked");
      expect(candidate.files).toEqual([]);
      expect(candidate.publicationReady).toBe(false);
    }
    expect(setup(ConflictCourse()).build().status).toBe("blocked");
    expect(setup(MultiSectionCourse(), ["active", "active"]).build().status).toBe("blocked");
  });

  it("rejects unreviewed decisions and strict serializer extras", () => {
    const { artifacts } = setup();
    expect(
      buildMigrationCandidate({
        ...artifacts,
        boundary: STAGED_PHASE_9_BOUNDARY,
        review: { ...artifacts.review, status: "incomplete" }
      }).status
    ).toBe("blocked");
    expect(() =>
      serializeMigrationYaml(migrationSectionSchema, {
        ...parse(file(setup().build(), sectionPath).content),
        invented: true
      })
    ).toThrow();
  });

  it("has no filesystem, Git, GitHub, journal, UI, ambient time or random capabilities", () => {
    const paths = [
      "src/migration/migration-candidate.ts",
      "src/migration/migration-candidate-schemas.ts"
    ];
    for (const path of paths) {
      const source = fs.readFileSync(path, "utf8");
      const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
      const imports = syntax.statements
        .filter(ts.isImportDeclaration)
        .filter((entry) => entry.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword)
        .map((entry) => (entry.moduleSpecifier as ts.StringLiteral).text);
      expect(
        imports.every(
          (entry) =>
            entry.startsWith("./") ||
            entry === "zod" ||
            entry === "yaml" ||
            entry === "../config/config-schemas.js" ||
            entry === "../manifest/manifest-loader.js"
        )
      ).toBe(true);
      expect(source).not.toMatch(
        /Date\.|new Date|Math\.random|randomUUID|process\.|fetch\(|node:fs|node:path|child_process|writeFile|execSync/
      );
    }
  });

  it("executes with filesystem, subprocess, network, clock and randomness operations forbidden", () => {
    const f = setup();
    const unexpected = () => {
      throw new Error("Unexpected I/O or ambient input.");
    };
    const spies = [
      vi.spyOn(fs, "readFileSync").mockImplementation(unexpected),
      vi.spyOn(fs, "writeFileSync").mockImplementation(unexpected),
      vi.spyOn(fs, "mkdirSync").mockImplementation(unexpected),
      vi.spyOn(fsPromises, "readFile").mockImplementation(unexpected),
      vi.spyOn(fsPromises, "writeFile").mockImplementation(unexpected),
      vi.spyOn(childProcess, "spawn").mockImplementation(unexpected),
      vi.spyOn(childProcess, "execFile").mockImplementation(unexpected),
      vi.spyOn(globalThis, "fetch").mockImplementation(unexpected),
      vi.spyOn(Date, "now").mockImplementation(unexpected),
      vi.spyOn(Math, "random").mockImplementation(unexpected)
    ];
    try {
      const candidate = f.build();
      expect(candidate.status).not.toBe("blocked");
      spies.forEach((spy) => {
        expect(spy).not.toHaveBeenCalled();
      });
    } finally {
      spies.forEach((spy) => {
        spy.mockRestore();
      });
    }
  });
});
