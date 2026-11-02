import path from "node:path";
import type {
  RawAssignmentConfig,
  RawCourseConfigV1,
  RawTermConfigV1
} from "../config/config-models.js";
import { parseCourseConfig } from "../config/load-course-config.js";
import { parseTermConfig } from "../config/load-term-config.js";
import { parseAssignmentConfig } from "../config/load-assignment-config.js";
import {
  validateAssignmentConfig,
  validateCourseConfig,
  validateTermConfig
} from "../config/config-validation.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { parseAndValidateRosterCsv } from "../roster/roster-shared.js";
import type { RosterRecord } from "../roster/roster-diff.js";
import type {
  AssignmentMigrationInventory,
  CourseMigrationAnalysis,
  CourseMigrationAnalysisData,
  FacultyReference,
  MigrationSnapshot,
  TermMigrationInventory
} from "./migration-models.js";
import {
  compare,
  textHash,
  creationOrderEvidence,
  fact,
  fingerprint,
  freeze,
  inventoryFaculty,
  isId,
  isSafeRelativePath,
  isSha,
  sortedUnique,
  stableJson
} from "./migration-evidence.js";
import { analyzeManifestEvidence } from "./manifest-analysis.js";

/** Legacy YAML parsing may throw on alias expansion limits; analysis must fail closed. */
const parseSafely = <T>(
  parser: (content: string, file: string) => T,
  content: string,
  file: string
): T | null => {
  try {
    return parser(content, file);
  } catch {
    return null;
  }
};

interface ValidatedTerm {
  code: string;
  config: RawTermConfigV1;
  assignments: RawAssignmentConfig[];
  roster: RosterRecord[];
  rosterComplete: boolean;
}

/** Analysis only. The caller must supply a complete, exact synchronized snapshot
 * and trusted evidence. No I/O, provider, runtime router or mutation capability is used.
 */
export const analyzeSchemaV1Migration = (input: MigrationSnapshot): CourseMigrationAnalysis => {
  const report: CourseMigrationAnalysisData = {
    kind: "schema-v1-migration-analysis",
    status: "blocked",
    source: structuredClone(input.binding),
    reportId: fingerprint({
      ...input,
      sourceProblems: sortedUnique(input.sourceProblems ?? []),
      trustedIdentities: [...(input.trustedIdentities ?? [])].sort((a, b) =>
        compare(stableJson(a), stableJson(b))
      ),
      suggestions: [...(input.suggestions ?? [])].sort((a, b) =>
        compare(stableJson(a), stableJson(b))
      ),
      history:
        input.history === undefined
          ? null
          : {
              ...input.history,
              commits: [...input.history.commits]
                .sort((a, b) => compare(a.sha, b.sha))
                .map((commit) => ({
                  ...commit,
                  parents: sortedUnique(commit.parents),
                  termCodes: sortedUnique(commit.termCodes)
                }))
            }
    }),
    validatedMigrationFacts: false,
    summary: {
      terms: 0,
      assignments: 0,
      faculty: 0,
      resolvedFaculty: 0,
      unresolvedFaculty: 0,
      blockingIssues: 0,
      reviewDecisions: 0,
      graderEvidence: 0
    },
    courseLifecycle: null,
    courseConfigurationEvidence: null,
    unassignedManifests: [],
    fallbackAdministrator: fact("requires_confirmation", null, "v1-has-no-fallback-administrator"),
    faculty: [],
    provisionalFacultyDirectory: fact("unresolved", [], "configuration-not-validated"),
    unresolvedIdentities: [],
    terms: [],
    assignments: [],
    termCreationOrder: fact("requires_confirmation", null, "git-history-unavailable"),
    termCreationEvidence: [],
    reviewDecisions: [],
    issues: [],
    grader: {
      activeV2Role: false,
      removalPhase: "9.4",
      statement:
        "Grader is not an active Schema v2 role. Historical migration debt is inventoried only; Phase 9.4 owns persisted removal and GitHub reconciliation. No cleanup is performed.",
      evidence: []
    },
    organization: fact(
      "unresolved",
      "organization_binding_unknown",
      "immutable-organization-history-unavailable"
    ),
    locatorDrift: [],
    runtimeCoverage: input.runtime.coverage
  };
  const issue = (
    code: string,
    location: string,
    message: string,
    classification: "blocking" | "unresolved" = "blocking"
  ) => {
    report.issues.push({ code, classification, location, message });
  };
  const decision = (key: string, reason: string, candidates: string[] = []) => {
    report.reviewDecisions.push({
      key,
      classification: "requires_confirmation",
      reason,
      candidates: sortedUnique(candidates)
    });
  };
  const diagnostics = (items: readonly Diagnostic[]) => {
    items.forEach((item) => {
      const location = item.context?.filePath ?? item.context?.rosterPath;
      issue(item.code, typeof location === "string" ? location : "config", item.message);
    });
  };
  const finish = (): CourseMigrationAnalysis => {
    report.issues.sort((a, b) => compare(stableJson(a), stableJson(b)));
    report.reviewDecisions.sort((a, b) => compare(a.key, b.key));
    report.grader.evidence.sort((a, b) => compare(stableJson(a), stableJson(b)));
    report.summary = {
      terms: report.terms.length,
      assignments: report.assignments.length,
      faculty: report.faculty.length,
      resolvedFaculty: report.faculty.filter((record) => record.resolution.value !== null).length,
      unresolvedFaculty: report.unresolvedIdentities.length,
      blockingIssues: report.issues.filter((item) => item.classification === "blocking").length,
      reviewDecisions: report.reviewDecisions.length,
      graderEvidence: report.grader.evidence.length
    };
    if (report.status !== "not_applicable")
      report.status =
        report.summary.blockingIssues > 0
          ? "blocked"
          : report.issues.length > 0 || report.unresolvedIdentities.length > 0
            ? "needs_attention"
            : "ready_for_review";
    return freeze(report);
  };
  const binding = input.binding;
  if (
    !isId(binding.repositoryId) ||
    !isSha(binding.sourceCommitSha) ||
    !isId(binding.authenticatedGithubUserId) ||
    (binding.organizationId !== undefined && !isId(binding.organizationId)) ||
    (binding.historicalOrganizationId !== undefined && !isId(binding.historicalOrganizationId)) ||
    (binding.historicalRepositoryId !== undefined && !isId(binding.historicalRepositoryId))
  ) {
    issue(
      "invalid_source_binding",
      "source",
      "Immutable repository identity, exact SHA and authenticated GitHub user ID are required."
    );
  }
  if (
    binding.historicalRepositoryId !== undefined &&
    binding.historicalRepositoryId !== binding.repositoryId
  )
    issue(
      "repository_identity_mismatch",
      "source",
      "Historical evidence belongs to a different immutable course repository."
    );
  for (const problem of input.sourceProblems ?? []) issue("source_read_failure", "source", problem);
  for (const file of Object.keys(input.sourceFiles))
    if (!isSafeRelativePath(file))
      issue("unsafe_source_path", "source", "Snapshot contains an unsafe source path.");
  if (report.issues.length) return finish();
  const courseResult = parseSafely(
    parseCourseConfig,
    input.sourceFiles["course.yml"] ?? "",
    "course.yml"
  );
  if (courseResult === null) {
    issue("unreadable_yaml", "course.yml", "Course YAML could not be parsed safely.");
    return finish();
  }
  diagnostics(courseResult.diagnostics);
  if (courseResult.status === "failure") return finish();
  if (courseResult.value.schema_version === 2) {
    report.status = "not_applicable";
    return finish();
  }
  const course: RawCourseConfigV1 = courseResult.value;
  diagnostics(validateCourseConfig("course.yml", course));
  const termCodes = sortedUnique(
    Object.keys(input.sourceFiles).flatMap((file) => {
      const parts = file.split("/");
      return parts[0] === "terms" && parts.length > 2 && parts[1] ? [parts[1]] : [];
    })
  );
  const terms: ValidatedTerm[] = [];
  for (const code of termCodes) {
    const location = `terms/${code}/term.yml`;
    const parsed = parseSafely(parseTermConfig, input.sourceFiles[location] ?? "", location);
    if (parsed === null) {
      issue("unreadable_yaml", location, "Term YAML could not be parsed safely.");
      continue;
    }
    diagnostics(parsed.diagnostics);
    if (parsed.status === "failure") continue;
    diagnostics(validateTermConfig(location, parsed.value, code));
    if (parsed.value.schema_version !== 1) continue;
    const config = parsed.value;
    const sectionIds = config.sections.map((section) => section.id);
    if (new Set(sectionIds).size !== sectionIds.length)
      issue("duplicate_sections", location, "Term section IDs must be unique.");
    const roster: RosterRecord[] = [];
    let rosterComplete = true;
    for (const section of [...config.sections].sort((a, b) => compare(a.id, b.id))) {
      if (section.roster === undefined) {
        rosterComplete = false;
        continue;
      }
      if (!isSafeRelativePath(section.roster)) {
        issue(
          "unsafe_roster_reference",
          location,
          "Roster must be a relative path within this term."
        );
        continue;
      }
      const rosterPath = path.posix.join(`terms/${code}`, section.roster);
      const content = input.sourceFiles[rosterPath];
      if (content === undefined) {
        issue(
          "missing_roster",
          rosterPath,
          "Referenced roster is missing from the exact source revision."
        );
        continue;
      }
      const parsedRoster = parseAndValidateRosterCsv({
        content,
        rosterPath,
        expectedSection: section.id
      });
      diagnostics(parsedRoster.errors);
      roster.push(...parsedRoster.records);
    }
    if (
      new Set(roster.map((student) => student.studentId)).size !== roster.length ||
      new Set(roster.map((student) => student.githubUsername)).size !== roster.length
    )
      issue(
        "duplicate_roster_identity",
        location,
        "Term rosters contain duplicate student or GitHub identities."
      );
    const slugs = sortedUnique(
      Object.keys(input.sourceFiles).flatMap((file) => {
        const prefix = `terms/${code}/assignments/`;
        if (!file.startsWith(prefix)) return [];
        const parts = file.slice(prefix.length).split("/");
        return parts.length > 1 && parts[0] ? [parts[0]] : [];
      })
    );
    const assignments: RawAssignmentConfig[] = [];
    for (const slug of slugs) {
      const file = `terms/${code}/assignments/${slug}/assignment.yml`;
      const parsedAssignment = parseSafely(
        parseAssignmentConfig,
        input.sourceFiles[file] ?? "",
        file
      );
      if (parsedAssignment === null) {
        issue("unreadable_yaml", file, "Assignment YAML could not be parsed safely.");
        continue;
      }
      diagnostics(parsedAssignment.diagnostics);
      if (parsedAssignment.status === "failure") continue;
      const assignment = parsedAssignment.value;
      diagnostics(validateAssignmentConfig(file, assignment, slug));
      if (new Set(assignment.sections).size !== assignment.sections.length)
        issue(
          "duplicate_assignment_sections",
          file,
          "Assignment section references must be unique."
        );
      if (assignment.sections.some((section) => !sectionIds.includes(section)))
        issue(
          "unknown_assignment_section",
          file,
          "Assignment references a nonexistent term section."
        );
      assignments.push(assignment);
    }
    terms.push({ code, config, assignments, roster, rosterComplete });
  }
  // Never turn readable fragments of malformed v1 into validated migration facts.
  if (report.issues.length) return finish();
  report.validatedMigrationFacts = true;
  if (input.runtime.coverage === "not_applicable" && Object.keys(input.runtime.files).length > 0)
    issue(
      "runtime_coverage_inconsistent",
      "runtime",
      "Runtime files are machine-local evidence and cannot be declared not applicable.",
      "unresolved"
    );
  report.courseConfigurationEvidence = fact(
    "derived",
    structuredClone(course),
    "course-config; v1-evidence-only"
  );
  if (course.course.repository !== binding.repositoryName)
    report.locatorDrift.push("course.repository");
  if (course.github.organization !== binding.organizationLogin)
    report.locatorDrift.push("github.organization");
  if (report.locatorDrift.length)
    issue(
      "locator_drift",
      "course.yml",
      "Configured locators differ from trusted current remote names; immutable repository identity is unchanged.",
      "unresolved"
    );
  if (binding.organizationId !== undefined && binding.historicalOrganizationId !== undefined) {
    const transferred = binding.organizationId !== binding.historicalOrganizationId;
    report.organization = fact(
      transferred ? "blocking" : "derived",
      transferred ? "organization_migration_required" : "organization_reconciled",
      "trusted-immutable-organization-binding"
    );
    if (transferred)
      issue(
        "organization_migration_required",
        "source",
        "Immutable organization changed; organization migration must be reconciled before schema publication."
      );
  } else
    issue(
      "organization_binding_unknown",
      "source",
      "Immutable historical/current organization continuity is unproven; future publication must block until reconciled.",
      "unresolved"
    );
  if (input.runtime.coverage !== "not_applicable")
    issue(
      "runtime_coverage_unproven",
      "runtime",
      "Machine-local or unavailable runtime evidence cannot establish completeness across machines.",
      "unresolved"
    );
  report.courseLifecycle = fact(
    "derived",
    "unarchived",
    "compatibility-preserving-migration-default; not historical archive evidence"
  );
  decision(
    "fallback_administrator",
    "Explicit selection is mandatory; authenticated identity and section membership do not confer this role."
  );
  const references: FacultyReference[] = [];
  for (const term of terms) {
    for (const section of term.config.sections)
      for (const username of sortedUnique(section.faculty ?? []))
        references.push({
          provenance: "v1-term-section-faculty",
          location: `terms/${term.code}/term.yml#sections/${section.id}/faculty`,
          termCode: term.code,
          sectionId: section.id,
          originalSpelling: username
        });
    for (const assignment of term.assignments)
      if (assignment.metadata?.faculty_owner !== undefined)
        references.push({
          provenance: "assignment-faculty-owner",
          location: `terms/${term.code}/assignments/${assignment.assignment.slug}/assignment.yml#metadata/faculty_owner`,
          termCode: term.code,
          assignmentSlug: assignment.assignment.slug,
          originalSpelling: assignment.metadata.faculty_owner
        });
  }
  report.faculty = inventoryFaculty(references, input, report.issues);
  report.unresolvedIdentities = report.faculty
    .filter((record) => record.resolution.value === null)
    .map((record) => record.institutionalUsername);
  report.provisionalFacultyDirectory = fact(
    "derived",
    report.faculty.flatMap((record) =>
      record.resolution.value === null ? [] : [record.resolution.value]
    ),
    "trusted-identity-evidence; provisional-only"
  );
  for (const username of report.unresolvedIdentities)
    decision(
      `faculty/${username}`,
      "Resolve the institutional username to an immutable GitHub identity."
    );
  const resolvedId = (username: string) =>
    report.faculty.find((record) => record.institutionalUsername === username)?.resolution.value
      ?.github_user_id;
  if (course.github.grader_team !== undefined || course.github.grader_permission !== undefined)
    report.grader.evidence.push({
      location: "course.yml#github",
      provenance: "course-config",
      team: course.github.grader_team ?? null,
      permission: course.github.grader_permission ?? null,
      classification: "derived"
    });
  const creation = creationOrderEvidence(input, termCodes);
  report.termCreationEvidence = creation.firstCommits;
  report.termCreationOrder = fact(
    "requires_confirmation",
    creation.order,
    creation.order === null
      ? "git-history-missing-incomplete-or-ambiguous"
      : "git-history; unique-ancestral-introductions"
  );
  decision(
    "term_creation_order",
    "Confirm an oldest-created-first order covering every canonical term; academic chronology is not authority.",
    creation.order ?? []
  );
  for (const term of terms) {
    const assignments: AssignmentMigrationInventory[] = term.assignments.map((assignment) => {
      const slug = assignment.assignment.slug;
      const owner = assignment.metadata?.faculty_owner ?? null;
      const ownerId = owner === null ? undefined : resolvedId(owner);
      const manifests = (["source", "runtime"] as const).map((provenance) =>
        analyzeManifestEvidence({
          input,
          termCode: term.code,
          courseCode: course.course.code,
          courseGithub: course.github,
          assignment,
          roster: term.roster,
          expectedSourcePaths: [
            "course.yml",
            `terms/${term.code}/term.yml`,
            `terms/${term.code}/assignments/${slug}/assignment.yml`,
            ...term.config.sections
              .filter(
                (section) =>
                  assignment.sections.includes(section.id) && section.roster !== undefined
              )
              .map((section) => `terms/${term.code}/${section.roster ?? ""}`)
          ],
          rosterComplete:
            term.rosterComplete &&
            assignment.sections.every((sectionId) =>
              term.config.sections.some(
                (section) => section.id === sectionId && section.roster !== undefined
              )
            ),
          provenance,
          graderEvidence: report.grader.evidence
        })
      );
      const observed = manifests.filter((manifest) => manifest.state !== "missing");
      const conflict =
        observed.length > 1 && observed[0]?.contentFingerprint !== observed[1]?.contentFingerprint;
      const applyState = conflict ? "ambiguous" : (observed[0]?.applyState ?? "not_observed");
      if (conflict || observed.some((manifest) => manifest.applyState !== "complete_evidence"))
        issue(
          "manifest_needs_attention",
          `terms/${term.code}/manifests/${slug}`,
          conflict
            ? "Source and runtime manifests conflict; neither is selected as authoritative."
            : "Manifest evidence is invalid, incomplete or ambiguous.",
          "unresolved"
        );
      const groupPath = `terms/${term.code}/assignments/${slug}/${assignment.groups?.file ?? "groups.csv"}`;
      const groupContent = input.sourceFiles[groupPath];
      if (assignment.repository_mode === "group") {
        decision(
          `assignments/${term.code}/${slug}/group_targets`,
          "Group target mapping and completeness require explicit review."
        );
        if (groupContent === undefined)
          issue(
            "group_evidence_missing",
            `terms/${term.code}/assignments/${slug}`,
            "Group configuration or referenced group file is missing.",
            "unresolved"
          );
      }
      if (owner === null)
        decision(
          `assignments/${term.code}/${slug}/owner`,
          "Ownerless assignment must remain repair-required/read-only until a coordinator assigns an owner."
        );
      if (assignment.assignment.status === "closed")
        decision(
          `assignments/${term.code}/${slug}/status`,
          "Legacy closed has no automatic v2 lifecycle equivalent."
        );
      return {
        termCode: term.code,
        slug,
        title: assignment.assignment.title,
        type: assignment.assignment.type,
        status: assignment.assignment.status,
        sections: sortedUnique(assignment.sections),
        facultyOwner: owner,
        owner: fact(
          owner === null || ownerId !== undefined ? "derived" : "unresolved",
          owner === null ? [] : ownerId === undefined ? null : [ownerId],
          "assignment-faculty-owner"
        ),
        ownerlessRepairRequired: owner === null,
        groupFileEvidence:
          assignment.repository_mode === "group"
            ? fact(
                "requires_confirmation",
                {
                  path: groupPath,
                  present: groupContent !== undefined,
                  contentFingerprint: groupContent === undefined ? null : textHash(groupContent)
                },
                "assignment-config; existing-v1-groups-file-default; group-membership-validation-required"
              )
            : null,
        sharedDeadline: fact(
          "derived",
          {
            deadline: assignment.deadline ?? null,
            copyToSections:
              assignment.deadline === undefined ? [] : sortedUnique(assignment.sections)
          },
          "assignment-config; fan-out-deferred-to-9.3"
        ),
        configurationEvidence: fact(
          "derived",
          structuredClone(assignment),
          "assignment-config; v1-evidence-only"
        ),
        manifests,
        applyState
      };
    });
    report.assignments.push(...assignments);
    const priorActivity = assignments.some((assignment) =>
      assignment.manifests.some((manifest) => manifest.provesPriorActivity)
    );
    const termReport: TermMigrationInventory = {
      code: term.code,
      academicYear: term.config.term.academic_year,
      semester: term.config.term.semester,
      displayName: term.config.term.display_name,
      sections: [...term.config.sections]
        .sort((a, b) => compare(a.id, b.id))
        .map((section) => {
          const usernames = sortedUnique(section.faculty ?? []);
          const ids = usernames.map(resolvedId);
          return {
            id: section.id,
            roster: section.roster ?? null,
            facultyIdentities: usernames,
            proposedCurrentFacultyIds: fact(
              ids.some((id) => id === undefined) ? "unresolved" : "derived",
              ids.some((id) => id === undefined) ? null : ids.filter((id) => id !== undefined),
              "v1-term-section-faculty; no-former-faculty-inferred"
            )
          };
        }),
      facultyIdentities: sortedUnique(
        term.config.sections.flatMap((section) => section.faculty ?? [])
      ),
      assignmentSlugs: assignments.map((assignment) => assignment.slug),
      lifecycle: {
        status: fact("requires_confirmation", null, "v1-has-no-term-lifecycle"),
        hasEverBeenActive: fact(
          priorActivity ? "derived" : "requires_confirmation",
          priorActivity ? true : null,
          priorActivity
            ? "source-manifest-operational-repository-evidence"
            : "absence-does-not-prove-false"
        )
      },
      coordinatorSelection: fact(
        "requires_confirmation",
        null,
        "v1-has-no-authoritative-coordinator-model"
      )
    };
    report.terms.push(termReport);
    decision(
      `terms/${term.code}/coordinators.current`,
      "Select at least one current coordinator. Section faculty are candidates only; no former history is inferred.",
      termReport.facultyIdentities
    );
    decision(
      `terms/${term.code}/status`,
      "Select draft, active or archived; the complete reviewed course must have at most one Active."
    );
    if (!priorActivity)
      decision(
        `terms/${term.code}/has_ever_been_active`,
        "Confirm activation history; absence of operational evidence does not prove false."
      );
  }
  // No persisted manifest can disappear merely because its assignment was removed.
  for (const provenance of ["source", "runtime"] as const) {
    const files = provenance === "source" ? input.sourceFiles : input.runtime.files;
    for (const file of Object.keys(files).sort(compare)) {
      const match = /^terms\/([^/]+)\/manifests\/([^/]+)\/manifest.yml$/u.exec(file);
      if (
        match &&
        !report.assignments.some(
          (assignment) => assignment.termCode === match[1] && assignment.slug === match[2]
        )
      ) {
        report.unassignedManifests.push(
          analyzeManifestEvidence({
            input,
            termCode: match[1] ?? "",
            courseCode: course.course.code,
            courseGithub: course.github,
            assignment: {
              schema_version: 1,
              assignment: {
                slug: match[2] ?? "",
                title: "Orphan manifest evidence",
                type: "individual",
                status: "draft"
              },
              sections: []
            },
            roster: [],
            rosterComplete: false,
            expectedSourcePaths: [],
            provenance,
            graderEvidence: report.grader.evidence
          })
        );
        issue(
          "orphan_manifest",
          `${provenance}:${file}`,
          "Manifest has no validated assignment; historical Apply/grader evidence requires review.",
          "unresolved"
        );
      }
    }
  }
  return finish();
};
