import fs from "node:fs";
import ts from "typescript";
import fsPromises from "node:fs/promises";
import childProcess from "node:child_process";
import { parse, stringify } from "yaml";
import { describe, expect, it, vi } from "vitest";
import {
  validateMigrationPublication,
  migrationCandidateFingerprint,
  type MigrationCompatibilityEvidence
} from "../../../src/migration/migration-publication-validation.js";
import { migrationManifestSchema } from "../../../src/migration/migration-candidate-schemas.js";
import { textHash } from "../../../src/migration/migration-evidence.js";
import {
  BasicCourse,
  MultiSectionCourse,
  IncompleteCourse,
  ConflictCourse,
  syntheticPublicationFixture,
  commentPath,
  gradingPath,
  gradingRecord
} from "./synthetic-migration-fixtures.js";
import { addManifest, assignment, term, putTerm, manifestPath } from "./migration-fixtures.js";

type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
const mutable = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>;
interface EditableDocument {
  schema_version: number;
  course: { repository_id: number; term_creation_order: string[] };
  faculty_directory: unknown[];
  fallback_administrator: { github_user_id: number };
  term: { status: string; has_ever_been_active: boolean };
  coordinators: { current: Array<{ github_user_id: number }> };
  sections: Array<{
    faculty: {
      current: Array<{ github_user_id: number }>;
      former: Array<{ github_user_id: number }>;
    };
  }>;
  assignment: { owners: number[]; lifecycle: string | null };
  section_id: string;
  schedule: { due_at: string };
  github: { grader_team: string };
  evidence: unknown[];
  provisioning: string;
  repositories: Array<{ repository: { id: number } }>;
}
const FOREIGN_ID = 9999;
const UNSUPPORTED_VERSION = 999;
const taskPath = "terms/27s1/assignments/lab04/assignment.yml";
const sectionPath = "terms/27s1/assignments/lab04/sections/001.yml";
const metadataPath = ".graider/migration.json";
const setup = syntheticPublicationFixture;
const codes = (result: ReturnType<typeof validateMigrationPublication>) =>
  result.blockers.map((entry) => entry.code);
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Missing fixture value.");
  return value;
};
const editFile = (
  f: ReturnType<typeof setup>,
  path: string,
  change: (value: EditableDocument) => void
) => {
  const candidate = mutable(f.context.candidate);
  const file = required(candidate.files.find((entry) => entry.path === path));
  const data = (
    path.endsWith(".json") ? JSON.parse(file.content) : parse(file.content)
  ) as EditableDocument;
  change(data);
  Object.assign(file, { content: path.endsWith(".json") ? JSON.stringify(data) : stringify(data) });
  Object.assign(file, {
    bytesBase64: Buffer.from(file.content).toString("base64"),
    sha256: textHash(file.content)
  });
  return validateMigrationPublication(f.context, { ...f.request, candidate });
};
const frozen = (value: unknown): void => {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
};

describe("pure complete migration publication gate", () => {
  it("validates a complete synthetic snapshot while never enabling production", () => {
    const f = setup();
    const result = f.run();
    expect(result.blockers).toEqual([]);
    expect(result.status).toBe("implementation_ready");
    expect(result.internalReady).toBe(true);
    expect(result.publicationReady).toBe(false);
    expect(result.productionEnablement.enabled).toBe(false);
    expect(result.productionEnablement.blockers.map((entry) => entry.code)).toContain(
      "synthetic_evidence"
    );
    expect(result.compatibility.operationalSupport).toBe("verified");
    expect(result.productionEnablement.releaseAvailability).toBe("verified");
    expect(result.candidateFingerprint).toBe(migrationCandidateFingerprint(f.context.candidate));
    expect(result.provenance.binding).toEqual(f.context.binding);
    frozen(result);
  });

  it("supports zero terms and mixed Draft/Archived history", () => {
    const zero = BasicCourse();
    zero.sourceFiles = { "course.yml": required(zero.sourceFiles["course.yml"]) };
    delete zero.history;
    expect(setup(zero).run().internalReady).toBe(true);
    expect(setup(MultiSectionCourse(), ["archived", "draft"]).run().internalReady).toBe(true);
  });

  it.each(["repositoryId", "organizationId", "authenticatedGithubUserId", "generation"] as const)(
    "rejects changed current %s",
    (key) => {
      const f = setup();
      const result = validateMigrationPublication(
        { ...f.context, current: { ...f.context.current, [key]: f.context.current[key] + 1 } },
        f.request
      );
      expect(codes(result)).toContain("source_binding_invalid");
    }
  );
  it.each([
    "sourceCommitSha",
    "reportId",
    "reviewId",
    "sessionId",
    "completionId",
    "assignmentPlanId",
    "graderRemovalPlanId",
    "candidateFingerprint"
  ] as const)("rejects stale %s", (key) => {
    const f = setup();
    expect(
      codes(
        validateMigrationPublication(
          { ...f.context, current: { ...f.context.current, [key]: "stale" } },
          f.request
        )
      )
    ).toContain("source_binding_invalid");
  });
  it("requires current faculty authority and the exact retained candidate", () => {
    const f = setup();
    expect(
      codes(validateMigrationPublication({ ...f.context, authorizedFaculty: false }, f.request))
    ).toContain("faculty_not_authorized");
    expect(
      codes(
        validateMigrationPublication(f.context, {
          ...f.request,
          candidate: structuredClone(f.request.candidate)
        })
      )
    ).toContain("candidate_untrusted");
  });

  it.each([
    [
      "course.yml",
      (v: EditableDocument) => {
        v.course.repository_id += 1;
      },
      "course_identity_invalid"
    ],
    [
      "course.yml",
      (v: EditableDocument) => {
        v.faculty_directory.push(v.faculty_directory[0]);
      },
      "faculty_directory_invalid"
    ],
    [
      "course.yml",
      (v: EditableDocument) => {
        v.fallback_administrator.github_user_id = FOREIGN_ID;
      },
      "faculty_directory_invalid"
    ],
    [
      "course.yml",
      (v: EditableDocument) => {
        v.course.term_creation_order = [];
      },
      "term_creation_order_invalid"
    ],
    [
      "terms/27s1/term.yml",
      (v: EditableDocument) => {
        v.term.status = "active";
        v.term.has_ever_been_active = false;
      },
      "term_lifecycle_invalid"
    ],
    [
      "terms/27s1/term.yml",
      (v: EditableDocument) => {
        v.coordinators.current = [{ github_user_id: FOREIGN_ID }];
      },
      "faculty_reference_invalid"
    ],
    [
      "terms/27s1/term.yml",
      (v: EditableDocument) => {
        v.sections.push(required(v.sections[0]));
      },
      "section_reference_invalid"
    ],
    [
      "terms/27s1/term.yml",
      (v: EditableDocument) => {
        required(v.sections[0]).faculty.former = required(v.sections[0]).faculty.current;
      },
      "faculty_history_invalid"
    ],
    [
      taskPath,
      (v: EditableDocument) => {
        v.assignment.owners = [FOREIGN_ID];
      },
      "assignment_owner_invalid"
    ],
    [
      taskPath,
      (v: EditableDocument) => {
        v.assignment.lifecycle = null;
      },
      "assignment_lifecycle_unresolved"
    ],
    [
      sectionPath,
      (v: EditableDocument) => {
        v.section_id = "foreign";
      },
      "section_reference_invalid"
    ],
    [
      sectionPath,
      (v: EditableDocument) => {
        v.schedule.due_at = "changed";
      },
      "section_evidence_invalid"
    ],
    [
      "course.yml",
      (v: EditableDocument) => {
        v.github.grader_team = "legacy";
      },
      "grader_desired_state"
    ],
    [
      metadataPath,
      (v: EditableDocument) => {
        v.schema_version = UNSUPPORTED_VERSION;
      },
      "metadata_version_unsupported"
    ],
    [
      metadataPath,
      (v: EditableDocument) => {
        v.evidence = [];
      },
      "preservation_invalid"
    ],
    [
      "course.yml",
      (v: EditableDocument) => {
        v.schema_version = UNSUPPORTED_VERSION;
      },
      "schema_unsupported"
    ]
  ] as const)("rejects cross-file alteration in %s (%s)", (path, edit, code) => {
    const result = editFile(setup(), path, edit);
    expect(codes(result)).toContain(code);
    expect(codes(result)).toContain("candidate_tampered");
    expect(result.internalReady).toBe(false);
  });

  it("allows acknowledged ownerless repair and incomplete Apply with exact records", () => {
    const input = MultiSectionCourse();
    putTerm(input, term, [{ ...assignment, metadata: {} }]);
    addManifest(input, (manifest) => {
      required(manifest.operation_history[0]).status = "failure";
    });
    const result = setup(input).run();
    expect(result.blockers).toEqual([]);
    expect(result.deferredFindings.some((entry) => entry.code === "owner_repair_required")).toBe(
      true
    );
    expect(result.deferredFindings.some((entry) => entry.code === "apply_incomplete")).toBe(true);
  });
  it("blocks unresolved required lifecycle and organization conditions", () => {
    const input = BasicCourse();
    putTerm(input, { ...term, sections: [required(term.sections[0])] }, [
      {
        ...assignment,
        sections: ["001"],
        assignment: { ...assignment.assignment, status: "closed" }
      }
    ]);
    expect(codes(setup(input).run())).toContain("assignment_lifecycle_unresolved");
    expect(codes(setup(ConflictCourse()).run())).toContain("organization_not_permitted");
  });
  it("preserves damaged grading and comments as explicit deferred findings", () => {
    const result = setup(
      IncompleteCourse({
        sourceFiles: { [commentPath]: "{damaged" },
        runtimeFiles: { [gradingPath]: "{damaged" }
      })
    ).run();
    expect(result.blockers).toEqual([]);
    expect(result.deferredFindings.some((entry) => entry.phase === "13")).toBe(true);
    expect(result.deferredFindings.some((entry) => entry.phase === "14")).toBe(true);
    expect(result.deferredFindings.some((entry) => entry.code === "comment_history_unknown")).toBe(
      true
    );
  });

  it("rejects manifest identity/provenance changes and fabricated Complete Apply", () => {
    const input = MultiSectionCourse();
    addManifest(input, (m) => {
      required(m.operation_history[0]).status = "failure";
    });
    const f = setup(input);
    expect(
      codes(
        editFile(f, manifestPath, (v) => {
          required(v.repositories[0]).repository.id += 1;
        })
      )
    ).toContain("manifest_provenance_invalid");
    expect(
      codes(
        editFile(f, sectionPath, (v) => {
          v.provisioning = "complete_evidence";
        })
      )
    ).toContain("section_evidence_invalid");
  });
  it.each([
    "../escape",
    "C:/course.yml",
    "notes\\file",
    "notes/CON.txt",
    ".git/config",
    "notes/trailing."
  ])("rejects unsafe path %s", (path) => {
    const f = setup();
    const candidate = mutable(f.context.candidate);
    candidate.files.push({ ...required(candidate.files[0]), path });
    expect(codes(validateMigrationPublication(f.context, { ...f.request, candidate }))).toContain(
      "unsafe_path"
    );
  });
  it("rejects deletion, aliases, byte/hash mismatches and altered audit", () => {
    const f = setup();
    const removed = mutable(f.context.candidate);
    removed.files = removed.files.filter((entry) => entry.path !== gradingPath);
    expect(
      codes(validateMigrationPublication(f.context, { ...f.request, candidate: removed }))
    ).toContain("file_preservation_invalid");
    const aliases = mutable(f.context.candidate);
    aliases.files.push({ ...required(aliases.files[0]), path: "Course.yml" });
    expect(
      codes(validateMigrationPublication(f.context, { ...f.request, candidate: aliases }))
    ).toContain("unsafe_path");
    const bad = mutable(f.context.candidate);
    required(bad.files[0]).sha256 = "0";
    expect(
      codes(validateMigrationPublication(f.context, { ...f.request, candidate: bad }))
    ).toContain("file_integrity_invalid");
    const audit = mutable(f.context.candidate);
    audit.audit.runtimeFiles = [{ ...required(audit.files[0]), path: "fake" }];
    expect(
      codes(validateMigrationPublication(f.context, { ...f.request, candidate: audit }))
    ).toContain("preservation_invalid");
  });

  it("fingerprints bytes and provenance deterministically independent of file/object key order", () => {
    const f = setup();
    const copy = mutable(f.context.candidate);
    copy.files.reverse();
    expect(migrationCandidateFingerprint(copy)).toBe(
      migrationCandidateFingerprint(f.context.candidate)
    );
    required(copy.files[0]).bytesBase64 = "changed";
    expect(migrationCandidateFingerprint(copy)).not.toBe(
      migrationCandidateFingerprint(f.context.candidate)
    );
    expect(f.run()).toEqual(f.run());
  });

  it.each([null, 1] as const)(
    "rejects unknown/parser-only operational support %s",
    (operationalSchema) => {
      const f = setup();
      const compatibility = { ...required(f.context.compatibility), operationalSchema };
      expect(
        codes(validateMigrationPublication({ ...f.context, compatibility }, f.request))
      ).toContain(
        operationalSchema === null
          ? "operational_support_unknown"
          : "operational_support_incompatible"
      );
    }
  );
  it.each([
    "access",
    "unsupportedSchema",
    "staleCache",
    "legacyMutations",
    "authoritativeRevision",
    "overwrite",
    "downgrade"
  ] as const)("requires safeguard %s", (key) => {
    const f = setup();
    const evidence = required(f.context.compatibility);
    const compatibility = { ...evidence, safeguards: { ...evidence.safeguards, [key]: null } };
    const result = validateMigrationPublication({ ...f.context, compatibility }, f.request);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "safeguard_unproven", location: key })
    );
  });
  it("rejects missing, stale, forged and renderer evidence", () => {
    const f = setup();
    const { compatibility: omitted, ...withoutEvidence } = f.context;
    expect(omitted).toBeDefined();
    expect(codes(validateMigrationPublication(withoutEvidence, f.request))).toContain(
      "compatibility_missing"
    );
    const evidence = required(f.context.compatibility);
    expect(
      codes(
        validateMigrationPublication({ ...f.context, observationId: "new-observation" }, f.request)
      )
    ).toContain("compatibility_stale");
    expect(
      codes(
        validateMigrationPublication(
          {
            ...f.context,
            compatibility: {
              ...evidence,
              scope: "renderer"
            } as unknown as MigrationCompatibilityEvidence
          },
          f.request
        )
      )
    ).toContain("compatibility_untrusted");
    expect(
      codes(validateMigrationPublication(f.context, { ...f.request, compatibility: evidence }))
    ).toContain("compatibility_untrusted");
    expect(
      codes(validateMigrationPublication({ ...f.context, environment: "production" }, f.request))
    ).toContain("compatibility_untrusted");
  });
  it.each(["missing", "stale", "foreign"] as const)("rejects %s acknowledgement", (kind) => {
    const f = setup();
    const evidence = required(f.context.compatibility);
    const acknowledgement =
      kind === "missing"
        ? null
        : {
            ...required(evidence.acknowledgement ?? undefined),
            ...(kind === "foreign"
              ? { githubUserId: FOREIGN_ID }
              : { binding: { ...f.context.binding, completionId: "old" } })
          };
    expect(
      codes(
        validateMigrationPublication(
          { ...f.context, compatibility: { ...evidence, acknowledgement } },
          f.request
        )
      )
    ).toContain("acknowledgement_invalid");
  });
  it.each(["macosArm64", "windowsX64", "signing", "distribution", "updates"] as const)(
    "keeps production disabled without verified %s",
    (key) => {
      const f = setup();
      const evidence = required(f.context.compatibility);
      const result = validateMigrationPublication(
        {
          ...f.context,
          compatibility: { ...evidence, releases: { ...evidence.releases, [key]: "unavailable" } }
        },
        f.request
      );
      expect(result.internalReady).toBe(true);
      expect(result.productionEnablement.blockers).toContainEqual(
        expect.objectContaining({ code: "production_release_unproven", location: key })
      );
      expect(result.publicationReady).toBe(false);
    }
  );

  it("rejects incomplete human/grader reviews and invalid plans even with a matching claimed binding", () => {
    const f = setup();
    const alterations = [
      { review: { ...f.context.artifacts.review, status: "incomplete" as const } },
      {
        graderRemovalPlan: {
          ...f.context.artifacts.graderRemovalPlan,
          audit: {
            ...f.context.artifacts.graderRemovalPlan.audit,
            accessReview: {
              ...f.context.artifacts.graderRemovalPlan.audit.accessReview,
              status: "incomplete" as const
            }
          }
        }
      },
      { assignmentPlan: { ...f.context.artifacts.assignmentPlan, status: "blocked" as const } }
    ];
    const expected = ["review_incomplete", "grader_review_invalid", "plan_invalid"];
    alterations.forEach((alteration, index) => {
      const result = validateMigrationPublication(
        { ...f.context, artifacts: { ...f.context.artifacts, ...alteration } },
        f.request
      );
      expect(codes(result)).toContain(expected[index]);
      expect(result.internalReady).toBe(false);
    });
  });

  it("rejects raw malformed requests and unknown technical fields", () => {
    const f = setup();
    for (const request of [
      null,
      [],
      "renderer assertion",
      { ...f.request, publicationReady: true }
    ])
      expect(codes(validateMigrationPublication(f.context, request))).toContain("request_invalid");
    const result = validateMigrationPublication(f.context, {
      ...f.request,
      candidate: { kind: "invented" }
    });
    expect(codes(result)).toContain("snapshot_invalid");
    const evidence = required(f.context.compatibility);
    expect(
      codes(
        validateMigrationPublication(
          {
            ...f.context,
            compatibility: {
              ...evidence,
              productionVerified: true
            } as MigrationCompatibilityEvidence
          },
          f.request
        )
      )
    ).toContain("compatibility_untrusted");
  });

  it("rejects two Active terms and contradictory prior activation", () => {
    expect(setup(MultiSectionCourse(), ["active", "active"]).run().internalReady).toBe(false);
    const f = setup(MultiSectionCourse(), ["archived", "active"]);
    const result = editFile(f, "terms/26s2/term.yml", (v) => {
      v.term.status = "active";
    });
    expect(codes(result)).toContain("term_lifecycle_invalid");
    const checkpoint = BasicCourse({
      sourceFiles: { "terms/27s1/activation-recovery.yml": "schema_version: 999" }
    });
    expect(codes(setup(checkpoint).run())).toContain("term_lifecycle_invalid");
  });

  it("rejects unsupported manifest evidence and conflicting immutable repository mappings", () => {
    const unsupported = BasicCourse({ sourceFiles: { [manifestPath]: "schema_version: 999" } });
    expect(codes(setup(unsupported).run())).toContain("schema_unsupported");
    const duplicate = MultiSectionCourse();
    addManifest(duplicate, (manifest) => {
      required(manifest.repositories[1]).repository.id = required(
        manifest.repositories[0]
      ).repository.id;
    });
    expect(codes(setup(duplicate).run())).toContain("manifest_provenance_invalid");
  });

  it("retains unchanged manifest template baselines and source/runtime copies", () => {
    const source = MultiSectionCourse();
    addManifest(source);
    source.runtime = {
      coverage: "machine_local",
      files: { [manifestPath]: required(source.sourceFiles[manifestPath]) }
    };
    const f = setup(source);
    expect(f.run().blockers).toEqual([]);
    const result = editFile(f, manifestPath, (v) => {
      required(v.repositories[0]).repository.id = FOREIGN_ID;
    });
    expect(codes(result)).toContain("manifest_provenance_invalid");
  });

  it("rejects unknown organization continuity independently of names", () => {
    const input = BasicCourse();
    delete input.binding.historicalOrganizationId;
    expect(codes(setup(input).run())).toContain("organization_not_permitted");
  });

  it("does not mutate or freeze caller-owned values, and the result cannot be mutated", () => {
    const f = setup();
    const context = mutable(f.context);
    const before = JSON.stringify(context);
    const result = validateMigrationPublication(context, {
      ...f.request,
      candidate: context.candidate
    });
    expect(context.candidate).not.toBe(f.context.candidate);
    expect(result.internalReady).toBe(true);
    expect(JSON.stringify(context)).toBe(before);
    expect(Object.isFrozen(context)).toBe(false);
    expect(Object.isFrozen(context.candidate)).toBe(false);
    expect(() => {
      Object.assign(result.provenance.binding, { sessionId: "changed" });
    }).toThrow();
    expect(() => {
      Object.assign(result.productionEnablement, { enabled: true });
    }).toThrow();
    frozen(result);
  });

  it("does not impose an extra ordering requirement on accepted human acknowledgements", () => {
    const input = BasicCourse();
    putTerm(input, { ...term, sections: [required(term.sections[0])] }, [
      {
        ...assignment,
        sections: ["001"],
        metadata: {},
        assignment: { ...assignment.assignment, status: "closed" }
      }
    ]);
    const f = setup(input);
    const review = {
      ...f.context.artifacts.review,
      acknowledgements: [...f.context.artifacts.review.acknowledgements].reverse()
    };
    const result = validateMigrationPublication(
      { ...f.context, artifacts: { ...f.context.artifacts, review } },
      f.request
    );
    expect(codes(result)).not.toContain("review_incomplete");
    expect(codes(result)).toContain("assignment_lifecycle_unresolved");
  });

  it.each(["invalid-id", "name-conflict", "course-conflict", "unsafe-anchor"] as const)(
    "blocks required manifest provenance defect: %s",
    (defect) => {
      const source = MultiSectionCourse();
      addManifest(source);
      const manifest = migrationManifestSchema.parse(
        parse(required(source.sourceFiles[manifestPath]))
      );
      const repo = required(manifest.repositories[0]).repository;
      if (defect === "invalid-id") repo.id = -1;
      if (defect === "name-conflict") repo.full_name = "foreign/repository";
      if (defect === "course-conflict") manifest.assignment.course_code = "FOREIGN";
      if (defect === "unsafe-anchor") required(manifest.source.source_files[0]).path = "../escape";
      source.sourceFiles = { ...source.sourceFiles, [manifestPath]: stringify(manifest) };
      expect(codes(setup(source).run())).toContain(
        defect === "unsafe-anchor" ? "unsafe_path" : "manifest_provenance_invalid"
      );
    }
  );

  it("preserves missing template baselines as Needs attention without inventing safe propagation", () => {
    const source = MultiSectionCourse();
    addManifest(source);
    const manifest = migrationManifestSchema.parse(
      parse(required(source.sourceFiles[manifestPath]))
    );
    const repo = required(manifest.repositories[0]).repository;
    repo.created_from_template = true;
    repo.template_sync_baseline_status = "baseline_required";
    delete repo.template_commit_sha;
    delete repo.student_default_branch_commit_sha;
    source.sourceFiles = { ...source.sourceFiles, [manifestPath]: stringify(manifest) };
    const result = setup(source).run();
    expect(result.blockers).toEqual([]);
    expect(result.deferredFindings).toContainEqual(
      expect.objectContaining({
        code: "template_baseline_unproven",
        classification: "needs_attention"
      })
    );
  });

  it("rejects technical evidence bound to an old reviewed candidate", () => {
    const f = setup();
    const compatibility = required(f.context.compatibility);
    const result = validateMigrationPublication(
      {
        ...f.context,
        compatibility: {
          ...compatibility,
          binding: { ...compatibility.binding, completionId: "old-completion" }
        }
      },
      f.request
    );
    expect(codes(result)).toContain("compatibility_stale");
    expect(result.compatibility.operationalSupport).toBe("unproven");
    expect(result.productionEnablement.releaseAvailability).toBe("unproven");
  });

  it("permits preserved cross-section group grading and ambiguous student observations under Decision A", () => {
    const input = MultiSectionCourse({
      studentObservations: [
        {
          termCode: "27s1",
          studentId: "student001",
          githubUserId: FOREIGN_ID,
          githubLogin: "renamed-student",
          reference: "fictional-first",
          provenance: "trusted-identity-evidence"
        },
        {
          termCode: "27s1",
          studentId: "student001",
          githubUserId: FOREIGN_ID + 1,
          githubLogin: "replacement-student",
          reference: "fictional-second",
          provenance: "trusted-identity-evidence"
        }
      ]
    });
    putTerm(input, term, [{ ...assignment, repository_mode: "group" }]);
    input.sourceFiles = {
      ...input.sourceFiles,
      [gradingPath.replace("student001", "group-a")]: JSON.stringify({
        ...gradingRecord(),
        studentId: "group-a"
      }),
      [manifestPath]: stringify({
        schema_version: 2,
        repository_mode: "group",
        targets: [
          {
            target_id: "group-a",
            mode: "group",
            group_id: "a",
            repository_name: "fictional-group",
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
    const f = setup(input);
    expect(f.run().blockers).toEqual([]);
    expect(f.context.candidate.preservation.grading).toContainEqual(
      expect.objectContaining({ targetId: "group-a", sectionPlacement: "cross_section" })
    );
    expect(f.run().deferredFindings).toContainEqual(
      expect.objectContaining({
        code: "group_targets_unresolved",
        classification: "needs_attention"
      })
    );
    expect(f.run().deferredFindings).toContainEqual(
      expect.objectContaining({ code: "student_identity_unresolved", phase: "13" })
    );
  });

  it("contains no filesystem, Git, GitHub, journal, UI, clock, randomness or callback capability", () => {
    for (const path of [
      "src/migration/migration-publication-validation.ts",
      "src/migration/migration-publication-models.ts",
      "src/migration/migration-compatibility-validation.ts"
    ]) {
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
            entry === "yaml" ||
            entry === "zod" ||
            entry === "../config/config-schemas.js"
        )
      ).toBe(true);
      expect(source).not.toMatch(
        /Date\.|new Date|Math\.random|randomUUID|process\.|fetch\(|node:fs|node:path|child_process|writeFile|execSync/
      );
    }
  });

  it("performs zero filesystem, subprocess, network, clock or random operations", () => {
    const f = setup();
    const unexpected = () => {
      throw new Error("Unexpected operation");
    };
    const spies = [
      vi.spyOn(fs, "readFileSync").mockImplementation(unexpected),
      vi.spyOn(fs, "writeFileSync").mockImplementation(unexpected),
      vi.spyOn(fsPromises, "readFile").mockImplementation(unexpected),
      vi.spyOn(fsPromises, "writeFile").mockImplementation(unexpected),
      vi.spyOn(childProcess, "spawn").mockImplementation(unexpected),
      vi.spyOn(childProcess, "execFile").mockImplementation(unexpected),
      vi.spyOn(globalThis, "fetch").mockImplementation(unexpected),
      vi.spyOn(Date, "now").mockImplementation(unexpected),
      vi.spyOn(Math, "random").mockImplementation(unexpected)
    ];
    try {
      expect(f.run().internalReady).toBe(true);
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
