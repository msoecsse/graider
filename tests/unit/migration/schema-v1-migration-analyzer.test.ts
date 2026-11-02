import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { analyzeSchemaV1Migration } from "../../../src/migration/schema-v1-migration-analyzer.js";
import {
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION
} from "../../../src/config/config-schemas.js";
import { createInputFingerprint } from "../../../src/config/source-fingerprint.js";
import {
  fixture,
  assignment,
  term,
  course,
  putTerm,
  addManifest,
  manifestObject,
  manifestPath,
  SHA,
  ROOT_SHA,
  MIDDLE_SHA,
  BRANCH_SHA,
  REPOSITORY_ID,
  ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  USER_ID,
  OTHER_USER_ID
} from "./migration-fixtures.js";

const analyze = analyzeSchemaV1Migration;

describe("Schema v1 migration analysis / binding", () => {
  it("analyzes valid v1 with exact immutable binding and mandatory human review", () => {
    const result = analyze(fixture());
    expect(result.status).toBe("ready_for_review");
    expect(result.validatedMigrationFacts).toBe(true);
    expect(result.source.repositoryId).toBe(REPOSITORY_ID);
    expect(result.source.sourceCommitSha).toBe(SHA);
    expect(result.kind).toBe("schema-v1-migration-analysis");
    expect(result.summary).toMatchObject({
      terms: 1,
      assignments: 1,
      faculty: 3,
      resolvedFaculty: 3
    });
    expect(result.reviewDecisions.length).toBeGreaterThan(0);
  });
  it("returns not applicable for valid v2", () => {
    const input = fixture();
    input.sourceFiles = {
      "course.yml": fs.readFileSync("tests/fixtures/config/schema-v2-course.yml", "utf8")
    };
    expect(analyze(input).status).toBe("not_applicable");
  });
  it.each([3, 4])("blocks unsupported newer course version %s", (schema_version) => {
    const input = fixture();
    input.sourceFiles = { "course.yml": stringify({ ...course, schema_version }) };
    expect(analyze(input)).toMatchObject({ status: "blocked", validatedMigrationFacts: false });
  });
  it.each([
    "[",
    "schema_version: 1",
    stringify({ ...course, github: { ...course.github, faculty_permission: "pull" } })
  ])("blocks malformed course without partial migration facts", (content) => {
    const input = fixture();
    input.sourceFiles = { ...input.sourceFiles, "course.yml": content };
    expect(analyze(input)).toMatchObject({
      status: "blocked",
      validatedMigrationFacts: false,
      terms: [],
      faculty: [],
      assignments: []
    });
  });
  it.each([
    { repositoryId: 0 },
    { sourceCommitSha: "main" },
    { authenticatedGithubUserId: 0 },
    { historicalRepositoryId: OTHER_USER_ID }
  ])("rejects insufficient or conflicting outer identity %j", (change) => {
    const input = fixture();
    input.binding = { ...input.binding, ...change };
    expect(analyze(input).status).toBe("blocked");
  });
  it("fails closed when malformed YAML exceeds alias expansion limits", () => {
    const input = fixture();
    const aliases = 110;
    const yaml = `a: &a [x]\nb: [${Array.from({ length: aliases }, () => "*a").join(",")}]`;
    input.sourceFiles = { ...input.sourceFiles, "course.yml": yaml };
    expect(analyze(input)).toMatchObject({ status: "blocked", validatedMigrationFacts: false });
    const manifests = fixture();
    manifests.sourceFiles = { ...manifests.sourceFiles, [manifestPath]: yaml };
    expect(analyze(manifests).assignments[0]?.manifests[0]?.state).toBe("invalid");
  });
  it("deeply freezes all public objects without freezing caller inputs", () => {
    const input = fixture();
    addManifest(input);
    const result = analyze(input);
    const assertFrozen = (value: unknown) => {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(assertFrozen);
      }
    };
    assertFrozen(result);
    const originalId = result.source.repositoryId;
    input.binding.repositoryId = OTHER_USER_ID;
    expect(result.source.repositoryId).toBe(originalId);
    expect(Object.isFrozen(input)).toBe(false);
  });
  it("is deterministic across file, trusted-evidence, and history input order", () => {
    const input = fixture();
    addManifest(input);
    const reversed = structuredClone(input);
    reversed.sourceFiles = Object.fromEntries(Object.entries(input.sourceFiles).reverse());
    reversed.trustedIdentities = [...(input.trustedIdentities ?? [])].reverse();
    if (reversed.history)
      reversed.history = { ...reversed.history, commits: [...reversed.history.commits].reverse() };
    expect(analyze(reversed)).toEqual(analyze(input));
  });
  it("fingerprint changes with runtime or identity evidence and source revision", () => {
    const input = fixture();
    const first = analyze(input).reportId;
    input.runtime.files = { [manifestPath]: "invalid" };
    expect(analyze(input).reportId).not.toBe(first);
    const second = analyze(input).reportId;
    input.binding.sourceCommitSha = ROOT_SHA;
    expect(analyze(input).reportId).not.toBe(second);
  });
});

describe("faculty evidence and mandatory authority review", () => {
  it("inventories all section faculty and assignment-only owners, deduplicating exact references", () => {
    const result = analyze(fixture());
    expect(result.faculty.map((item) => item.institutionalUsername)).toEqual([
      "jones",
      "owner",
      "smith"
    ]);
    expect(result.faculty[0]?.references.map((item) => item.sectionId)).toEqual(["001", "002"]);
    expect(result.faculty[1]?.references[0]?.provenance).toBe("assignment-faculty-owner");
    expect(result.provisionalFacultyDirectory.value).toHaveLength(3);
  });
  it("preserves case-sensitive v1 references and blocks collisions in the case-insensitive v2 directory", () => {
    const input = fixture();
    putTerm(
      input,
      { ...term, sections: [{ id: "001", faculty: ["jones", "Jones", "jones"] }] },
      []
    );
    const result = analyze(input);
    expect(result.status).toBe("blocked");
    expect(result.faculty.map((item) => item.institutionalUsername)).toEqual(["Jones", "jones"]);
    expect(
      result.provisionalFacultyDirectory.value.some(
        (item) => item.institutional_username.toLowerCase() === "jones"
      )
    ).toBe(false);
  });
  it("does not resolve a similar login or authentication alone", () => {
    const input = fixture();
    input.trustedIdentities = [];
    input.suggestions = [
      {
        institutionalUsername: "jones",
        githubLogin: "jones",
        githubUserId: USER_ID,
        reason: "similar login"
      }
    ];
    const result = analyze(input);
    expect(result.unresolvedIdentities).toEqual(["jones", "owner", "smith"]);
    expect(result.faculty[0]?.suggestions[0]?.classification).toBe("requires_confirmation");
    expect(result.provisionalFacultyDirectory.value).toEqual([]);
  });
  it("accepts an explicitly verified authenticated mapping but never selects fallback", () => {
    const input = fixture();
    input.trustedIdentities = [
      {
        institutionalUsername: "jones",
        githubUserId: USER_ID,
        githubLogin: "jones",
        provenance: "authenticated-identity",
        reference: "institutional-identity-verified"
      }
    ];
    const result = analyze(input);
    expect(result.faculty[0]?.resolution.value?.github_user_id).toBe(USER_ID);
    expect(result.fallbackAdministrator).toMatchObject({
      classification: "requires_confirmation",
      value: null
    });
  });
  it("blocks conflicting immutable IDs", () => {
    const input = fixture();
    input.trustedIdentities = [
      ...(input.trustedIdentities ?? []),
      {
        institutionalUsername: "jones",
        githubUserId: OTHER_USER_ID,
        githubLogin: "another",
        provenance: "trusted-identity-evidence",
        reference: "verified"
      }
    ];
    expect(analyze(input).issues.some((item) => item.code === "identity_conflict")).toBe(true);
    expect(analyze(input).status).toBe("blocked");
  });
  it("same-ID login rename is one identity when current/history is proven", () => {
    const input = fixture();
    input.trustedIdentities = [
      {
        institutionalUsername: "jones",
        githubUserId: USER_ID,
        githubLogin: "old-jones",
        provenance: "trusted-identity-evidence",
        reference: "old"
      },
      {
        institutionalUsername: "jones",
        githubUserId: USER_ID,
        githubLogin: "new-jones",
        githubLoginHistory: ["old-jones"],
        provenance: "trusted-identity-evidence",
        reference: "new"
      }
    ];
    expect(analyze(input).faculty[0]?.resolution.value).toMatchObject({
      github_user_id: USER_ID,
      github_login: "new-jones",
      github_login_history: ["old-jones"]
    });
  });
  it("competing current logins for one ID require confirmation rather than a guessed current login", () => {
    const input = fixture();
    input.trustedIdentities = ["old-jones", "new-jones"].map((githubLogin) => ({
      institutionalUsername: "jones",
      githubUserId: USER_ID,
      githubLogin,
      provenance: "trusted-identity-evidence",
      reference: "verified"
    }));
    expect(analyze(input).faculty[0]?.resolution.value).toBeNull();
    expect(analyze(input).issues.some((item) => item.code === "identity_conflict")).toBe(false);
  });
  it("blocks duplicate GitHub IDs across distinct institutional identities", () => {
    const input = fixture();
    input.trustedIdentities = ["jones", "smith"].map((institutionalUsername) => ({
      institutionalUsername,
      githubUserId: USER_ID,
      githubLogin: "same-person",
      provenance: "trusted-identity-evidence",
      reference: "verified"
    }));
    const result = analyze(input);
    expect(result.status).toBe("blocked");
    expect(result.provisionalFacultyDirectory.value).toEqual([]);
  });
  it("requires coordinator selection and resolves section current relationships without inventing history", () => {
    const result = analyze(fixture());
    expect(result.terms[0]?.coordinatorSelection.value).toBeNull();
    expect(result.terms[0]?.sections[0]?.proposedCurrentFacultyIds.value).toEqual([
      USER_ID,
      OTHER_USER_ID
    ]);
    expect(
      result.reviewDecisions.find((item) => item.key.endsWith("coordinators.current"))?.candidates
    ).toEqual(["jones", "smith"]);
    expect(JSON.stringify(result.terms)).not.toContain('"former"');
  });
  it("unresolved faculty blocks proposed section relationship", () => {
    const input = fixture();
    input.trustedIdentities = [];
    expect(analyze(input).terms[0]?.sections[0]?.proposedCurrentFacultyIds).toMatchObject({
      classification: "unresolved",
      value: null
    });
  });
});

describe("terms, creation order, lifecycle", () => {
  it("inventories all canonical terms, with stable presentation independent of history order", () => {
    const input = fixture();
    putTerm(input, {
      ...term,
      term: { ...term.term, code: "26s3", academic_year: 2026, semester: 3 }
    });
    const result = analyze(input);
    expect(result.terms.map((item) => item.code)).toEqual(["26s3", "27s1"]);
    expect(result.termCreationOrder.value).toBeNull();
  });
  it.each(["missing", "malformed", "mismatch", "newer", "bad-roster", "duplicate-sections"])(
    "blocks invalid term evidence: %s",
    (problem) => {
      const input = fixture();
      const files = { ...input.sourceFiles };
      if (problem === "missing") delete files["terms/27s1/term.yml"];
      if (problem === "malformed") files["terms/27s1/term.yml"] = "[";
      if (problem === "mismatch")
        files["terms/27s1/term.yml"] = stringify({ ...term, term: { ...term.term, code: "28s1" } });
      if (problem === "newer")
        files["terms/27s1/term.yml"] = stringify({ ...term, schema_version: 3 });
      if (problem === "bad-roster") files["terms/27s1/rosters/001.csv"] = "wrong,columns";
      if (problem === "duplicate-sections")
        files["terms/27s1/term.yml"] = stringify({
          ...term,
          sections: [term.sections[0], term.sections[0]]
        });
      input.sourceFiles = files;
      expect(analyze(input)).toMatchObject({
        status: "blocked",
        validatedMigrationFacts: false,
        terms: []
      });
    }
  );
  it("supports zero terms, retaining explicit fallback and order review", () => {
    const input = fixture();
    input.sourceFiles = { "course.yml": stringify(course) };
    input.history = {
      sourceCommitSha: SHA,
      complete: true,
      commits: [{ sha: SHA, parents: [], termCodes: [] }]
    };
    const result = analyze(input);
    expect(result.status).toBe("ready_for_review");
    expect(result.terms).toEqual([]);
    expect(result.termCreationOrder.value).toEqual([]);
    expect(result.fallbackAdministrator.value).toBeNull();
  });
  it("proposes proven ancestral creation order even when academic order is opposite; still requires review", () => {
    const input = fixture();
    putTerm(input, {
      ...term,
      term: { ...term.term, code: "26s3", academic_year: 2026, semester: 3 }
    });
    input.history = {
      sourceCommitSha: SHA,
      complete: true,
      commits: [
        { sha: ROOT_SHA, parents: [], termCodes: [] },
        { sha: MIDDLE_SHA, parents: [ROOT_SHA], termCodes: ["27s1"] },
        { sha: SHA, parents: [MIDDLE_SHA], termCodes: ["26s3", "27s1"] }
      ]
    };
    expect(analyze(input).termCreationOrder).toMatchObject({
      classification: "requires_confirmation",
      value: ["27s1", "26s3"]
    });
  });
  it.each(["missing", "shallow", "tied", "incomparable", "deleted", "dangling", "cycle"])(
    "does not guess term order with %s history",
    (problem) => {
      const input = fixture();
      putTerm(input, { ...term, term: { ...term.term, code: "26s3" } });
      if (problem === "missing") delete input.history;
      else
        input.history = {
          sourceCommitSha: SHA,
          complete: problem !== "shallow",
          commits: [
            {
              sha: ROOT_SHA,
              parents: problem === "cycle" ? [SHA] : [],
              termCodes: problem === "deleted" ? ["27s1"] : []
            },
            {
              sha: MIDDLE_SHA,
              parents: [ROOT_SHA],
              termCodes: problem === "incomparable" ? ["27s1"] : []
            },
            ...(problem === "incomparable"
              ? [{ sha: BRANCH_SHA, parents: [ROOT_SHA], termCodes: ["26s3"] }]
              : []),
            {
              sha: SHA,
              parents:
                problem === "dangling"
                  ? [BRANCH_SHA]
                  : problem === "incomparable"
                    ? [MIDDLE_SHA, BRANCH_SHA]
                    : [MIDDLE_SHA],
              termCodes: ["26s3", "27s1"]
            }
          ]
        };
      expect(analyze(input).termCreationOrder.value).toBeNull();
    }
  );
  it("never chooses lifecycle from dates/status or treats absence as false", () => {
    const input = fixture();
    putTerm(input, { ...term, term: { ...term.term, code: "26s3", academic_year: 1990 } });
    const result = analyze(input);
    expect(result.terms).toHaveLength(2);
    for (const item of result.terms) {
      expect(item.lifecycle.status).toMatchObject({
        classification: "requires_confirmation",
        value: null
      });
      expect(item.lifecycle.hasEverBeenActive.value).toBeNull();
    }
    expect(result.courseLifecycle).toMatchObject({
      classification: "derived",
      value: "unarchived"
    });
  });
  it("source operational evidence proves only the positive prior-activity fact", () => {
    const input = fixture();
    addManifest(input);
    const result = analyze(input);
    expect(result.terms[0]?.lifecycle.hasEverBeenActive).toMatchObject({
      classification: "derived",
      value: true
    });
    expect(result.terms[0]?.lifecycle.status.value).toBeNull();
  });
  it("machine-local evidence does not establish authoritative prior activity", () => {
    const input = fixture();
    input.runtime = {
      coverage: "machine_local",
      files: { [manifestPath]: stringify(manifestObject(input)) }
    };
    const result = analyze(input);
    expect(result.status).toBe("needs_attention");
    expect(result.terms[0]?.lifecycle.hasEverBeenActive.value).toBeNull();
  });
});

describe("assignment and manifest inventory", () => {
  it("reports one-entry owner proposal and exact deadline section fan-out without conversion", () => {
    const result = analyze(fixture());
    expect(result.assignments[0]?.owner.value).toEqual([USER_ID + 2]);
    expect(result.assignments[0]?.sharedDeadline.value).toEqual({
      deadline: assignment.deadline,
      copyToSections: ["001", "002"]
    });
    expect(result.assignments[0]?.configurationEvidence.value).toEqual(assignment);
    expect(result.courseConfigurationEvidence?.value.grading).toEqual(course.grading);
  });
  it("keeps ownerless assignments repair-required and missing deadlines absent", () => {
    const input = fixture();
    const config = structuredClone(assignment);
    delete config.metadata;
    delete config.deadline;
    putTerm(input, term, [config]);
    const result = analyze(input);
    expect(result.assignments[0]).toMatchObject({
      ownerlessRepairRequired: true,
      owner: { value: [] },
      sharedDeadline: { value: { deadline: null, copyToSections: [] } }
    });
  });
  it("surfaces unresolved owners", () => {
    const input = fixture();
    input.trustedIdentities = [];
    expect(analyze(input).assignments[0]?.owner).toMatchObject({
      classification: "unresolved",
      value: null
    });
  });
  it("blocks invalid section references and malformed assignment without partial facts", () => {
    const input = fixture();
    putTerm(input, term, [{ ...assignment, sections: ["missing"] }]);
    expect(analyze(input)).toMatchObject({ status: "blocked", validatedMigrationFacts: false });
    putTerm(input, term, [{ ...assignment, schema_version: 3 }]);
    expect(analyze(input).status).toBe("blocked");
  });
  it("represents missing manifests as not observed, never complete", () => {
    const result = analyze(fixture());
    expect(result.assignments[0]?.manifests.map((item) => item.state)).toEqual([
      "missing",
      "missing"
    ]);
    expect(result.assignments[0]?.applyState).toBe("not_observed");
  });
  it("validates complete manifest evidence, immutable repository IDs, sections and history", () => {
    const input = fixture();
    addManifest(input);
    const result = analyze(input);
    expect(result.assignments[0]?.applyState).toBe("complete_evidence");
    expect(
      result.assignments[0]?.manifests[0]?.repositories.map((item) => item.repositoryId)
    ).toEqual([USER_ID, OTHER_USER_ID]);
    expect(result.assignments[0]?.manifests[0]?.sectionStates.map((item) => item.state)).toEqual([
      "complete_evidence",
      "complete_evidence"
    ]);
    expect(result.assignments[0]?.manifests[0]?.operations[0]).toMatchObject({
      command: "apply",
      status: "success",
      completed: true
    });
  });
  it.each([
    "failure",
    "partial_success",
    "missing-record",
    "pending",
    "incomplete-operation",
    "error-lifecycle",
    "permission-mismatch"
  ])("never converts %s to complete evidence", (problem) => {
    const input = fixture();
    addManifest(input, (manifest) => {
      const operation = manifest.operation_history[0];
      const repository = manifest.repositories[0];
      if (operation && ["failure", "partial_success"].includes(problem)) operation.status = problem;
      if (problem === "missing-record") manifest.repositories.pop();
      if (operation && problem === "incomplete-operation") delete operation.completed_at;
      if (repository && problem === "permission-mismatch")
        repository.permissions.student.permission = "pull";
      if (repository && problem === "pending") repository.permissions.student.pending_invite = true;
      if (repository && problem === "error-lifecycle") repository.lifecycle.status = "error";
    });
    const result = analyze(input);
    expect(result.assignments[0]?.applyState).toBe("partial_incomplete");
    expect(result.status).toBe("needs_attention");
  });
  it.each(["[", "schema_version: 5"])(
    "reports invalid manifest with diagnostics: %s",
    (content) => {
      const input = fixture();
      input.sourceFiles = { ...input.sourceFiles, [manifestPath]: content };
      const evidence = analyze(input).assignments[0]?.manifests[0];
      expect(evidence?.state).toBe("invalid");
      expect(evidence?.diagnostics.length).toBeGreaterThan(0);
    }
  );
  it("reports stale source anchors as ambiguous", () => {
    const input = fixture();
    addManifest(input);
    putTerm(input, term, [
      { ...assignment, assignment: { ...assignment.assignment, title: "Changed" } }
    ]);
    expect(analyze(input).assignments[0]?.applyState).toBe("ambiguous");
  });
  it("requires all expected source anchors before claiming complete", () => {
    const input = fixture();
    addManifest(input, (manifest) => {
      manifest.source.source_files = manifest.source.source_files.filter(
        (item) => item.path === "course.yml"
      );
      manifest.source.input_fingerprint = createInputFingerprint(manifest.source.source_files);
    });
    expect(analyze(input).assignments[0]?.applyState).toBe("ambiguous");
  });
  it("reports conflicting source/runtime evidence without preferring either", () => {
    const input = fixture();
    addManifest(input);
    const runtimeManifest = manifestObject(input);
    runtimeManifest.repositories.pop();
    input.runtime = {
      coverage: "machine_local",
      files: { [manifestPath]: stringify(runtimeManifest) }
    };
    const result = analyze(input);
    expect(result.assignments[0]?.applyState).toBe("ambiguous");
    expect(result.assignments[0]?.manifests.map((item) => item.provenance)).toEqual([
      "source",
      "runtime"
    ]);
    expect(result.issues.some((item) => item.message.includes("conflict"))).toBe(true);
  });
  it("identical runtime evidence still cannot establish global completeness", () => {
    const input = fixture();
    addManifest(input);
    input.runtime = {
      coverage: "machine_local",
      files: { [manifestPath]: input.sourceFiles[manifestPath] ?? "" }
    };
    expect(analyze(input).issues.some((item) => item.code === "runtime_coverage_unproven")).toBe(
      true
    );
  });
  it("inventories the existing default groups.csv without inventing a missing config field", () => {
    const input = fixture();
    putTerm(input, term, [{ ...assignment, repository_mode: "group" }]);
    input.sourceFiles = {
      ...input.sourceFiles,
      "terms/27s1/assignments/lab04/groups.csv": "group_id,student_id\na,student001\na,student002\n"
    };
    const result = analyze(input);
    expect(result.assignments[0]?.groupFileEvidence).toMatchObject({
      classification: "requires_confirmation",
      value: { present: true, path: "terms/27s1/assignments/lab04/groups.csv" }
    });
    expect(result.issues.some((item) => item.code === "group_evidence_missing")).toBe(false);
  });
  it("inventories group manifest v2 targets and mappings without false completeness", () => {
    const input = fixture();
    input.sourceFiles = {
      ...input.sourceFiles,
      [manifestPath]: stringify({
        schema_version: 2,
        repository_mode: "group",
        targets: [
          {
            target_id: "group-a",
            mode: "group",
            group_id: "a",
            repository_name: "group-repo",
            lifecycle_status: "active",
            section_ids: ["001"],
            student_ids: ["student001"],
            github_usernames: ["student-001"],
            diagnostics: []
          }
        ],
        student_mappings: [
          {
            student_id: "student001",
            github_username: "student-001",
            target_id: "group-a",
            repository_name: "group-repo"
          }
        ],
        diagnostics: []
      })
    };
    const evidence = analyze(input).assignments[0]?.manifests[0];
    expect(evidence?.targets[0]?.targetId).toBe("group-a");
    expect(evidence?.studentMappings).toHaveLength(1);
    expect(evidence?.applyState).toBe("ambiguous");
  });
  it("inventories orphan manifest and its grader debt rather than losing history", () => {
    const input = fixture();
    addManifest(input);
    input.sourceFiles = {
      ...input.sourceFiles,
      [manifestPath.replace("lab04", "deleted")]: input.sourceFiles[manifestPath] ?? ""
    };
    const result = analyze(input);
    expect(result.unassignedManifests).toHaveLength(1);
    expect(result.grader.evidence.some((item) => item.location.includes("deleted"))).toBe(true);
  });
  it("inventories grader debt without synthesizing a role or proposing removal", () => {
    const input = fixture();
    addManifest(input);
    const result = analyze(input);
    expect(result.grader).toMatchObject({ activeV2Role: false, removalPhase: "9.4" });
    expect(result.grader.evidence).toHaveLength(3);
    expect(result.grader.evidence.map((item) => item.provenance)).toContain("course-config");
    expect(result.faculty.some((item) => item.institutionalUsername === "graders")).toBe(false);
  });
});

describe("organization and production boundary", () => {
  it("immutable organization continuity proves reconciliation despite locator rename", () => {
    const input = fixture();
    input.binding.repositoryName = "renamed-admin";
    input.binding.organizationLogin = "renamed-org";
    const result = analyze(input);
    expect(result.organization.value).toBe("organization_reconciled");
    expect(result.locatorDrift).toEqual(["course.repository", "github.organization"]);
    expect(result.source.repositoryId).toBe(REPOSITORY_ID);
  });
  it("proven immutable transfer blocks eventual schema publication", () => {
    const input = fixture();
    input.binding.organizationId = OTHER_ORGANIZATION_ID;
    expect(analyze(input)).toMatchObject({
      status: "blocked",
      organization: { value: "organization_migration_required" }
    });
  });
  it.each([true, false])(
    "missing historical organization ID is unknown even when locator matches: %s",
    (sameLogin) => {
      const input = fixture();
      delete input.binding.historicalOrganizationId;
      if (!sameLogin) input.binding.organizationLogin = "other-org";
      expect(analyze(input).organization.value).toBe("organization_binding_unknown");
      expect(analyze(input).status).toBe("needs_attention");
      expect(input.binding.organizationId).toBe(ORGANIZATION_ID);
    }
  );
  it("analyzer has zero filesystem writes and no provider, Git, journal or mutation capability", () => {
    const input = fixture();
    addManifest(input);
    const before = structuredClone(input);
    const writes = [
      vi.spyOn(fs, "writeFileSync"),
      vi.spyOn(fs, "mkdirSync"),
      vi.spyOn(fs, "copyFileSync"),
      vi.spyOn(fs, "renameSync"),
      vi.spyOn(fs, "unlinkSync")
    ];
    try {
      analyze(input);
      for (const write of writes) expect(write).not.toHaveBeenCalled();
      expect(input).toEqual(before);
    } finally {
      writes.forEach((write) => {
        write.mockRestore();
      });
    }
  });
  it("preserves both operational Schema 1 gates", () => {
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });
});
