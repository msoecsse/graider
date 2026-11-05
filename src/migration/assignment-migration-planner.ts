import type {
  ApplyEvidenceState,
  CourseMigrationAnalysis,
  Immutable,
  ManifestMigrationEvidence
} from "./migration-models.js";
import type { MigrationReviewResult } from "./migration-review-models.js";
import type {
  AssignmentMigrationFindingCode,
  AssignmentMigrationPlan,
  AssignmentMigrationPlanData,
  AssignmentMigrationProjection
} from "./assignment-migration-models.js";

const freeze = <T>(value: T): Immutable<T> => {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((item: unknown) => freeze(item));
    Object.freeze(value);
  }
  return value as Immutable<T>;
};
// These literal fields still require runtime checks at the trusted-object API boundary.
const hasReviewAuthority = (value: {
  readonly kind: unknown;
  readonly publicationReady: unknown;
}): boolean => value.kind === "schema-v1-migration-review" && value.publicationReady === false;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const sameSections = (a: readonly string[], b: readonly string[]): boolean =>
  same([...a].sort(), [...b].sort());
const projectManifest = (m: Immutable<ManifestMigrationEvidence>): ManifestMigrationEvidence => ({
  provenance: m.provenance,
  location: m.location,
  contentFingerprint: m.contentFingerprint,
  state: m.state,
  classification: m.classification,
  schemaVersion: m.schemaVersion,
  applyState: m.applyState,
  sectionStates: m.sectionStates.map((s) => ({ ...s })),
  repositories: m.repositories.map((r) => ({ ...r })),
  targets: m.targets.map((t) => ({
    ...t,
    sectionIds: [...t.sectionIds],
    studentIds: [...t.studentIds]
  })),
  operations: m.operations.map((o) => ({ ...o })),
  studentMappings: m.studentMappings.map((s) => ({ ...s })),
  diagnostics: [...m.diagnostics],
  provesPriorActivity: m.provesPriorActivity
});

/** Pure projection of trusted 9.1/9.2 objects. No publication or execution authority. */
export const planAssignmentMigration = (
  analysis: CourseMigrationAnalysis,
  review: MigrationReviewResult
): AssignmentMigrationPlan => {
  const plan: AssignmentMigrationPlanData = {
    kind: "schema-v1-assignment-migration-plan",
    status: "ready",
    publicationReady: false,
    source: {
      repositoryId: analysis.source.repositoryId,
      sourceCommitSha: analysis.source.sourceCommitSha,
      reportId: analysis.reportId,
      authenticatedGithubUserId: analysis.source.authenticatedGithubUserId
    },
    assignments: [],
    findings: [],
    runtimeCoverage: analysis.runtimeCoverage,
    organizationCondition: review.organizationCondition,
    publicationBlockers: [...review.publicationBlockers],
    grader: {
      removalPhase: "9.4",
      evidence: analysis.grader.evidence.map((e) => ({ ...e })),
      debtPresent: review.graderDebtPresent || analysis.grader.evidence.length > 0
    }
  };
  // Clone before freezing so even mutable caller-owned test/domain values stay untouched.
  const finish = (): AssignmentMigrationPlan => freeze(structuredClone(plan));
  const block = (
    code: AssignmentMigrationFindingCode,
    message: string
  ): AssignmentMigrationPlan => {
    plan.status = "blocked";
    plan.assignments = [];
    plan.findings.push({ code, message });
    return finish();
  };
  if (
    !same(plan.source, {
      repositoryId: review.source.repositoryId,
      sourceCommitSha: review.source.sourceCommitSha,
      reportId: review.source.reportId,
      authenticatedGithubUserId: review.source.authenticatedGithubUserId
    })
  )
    return block(
      "review_binding_invalid",
      "Review does not belong to this exact analysis and authenticated identity."
    );
  if (!hasReviewAuthority(review))
    return block("review_not_authorized", "Review has no valid assignment planning authority.");
  if (analysis.status === "not_applicable" && review.status === "not_applicable") {
    plan.status = "not_applicable";
    return finish();
  }
  if (
    review.status !== "complete" ||
    !analysis.validatedMigrationFacts ||
    analysis.status === "blocked" ||
    analysis.status === "not_applicable"
  )
    return block(
      "review_not_authorized",
      "Planning requires validated v1 facts and a completed matching review."
    );

  if (analysis.assignments.length === 0) {
    plan.status = "not_applicable";
    return finish();
  }

  // The reviewed summary is a retained decision, never an alternative source to choose over 9.1.
  if (review.assignmentReviewSummary.length !== analysis.assignments.length)
    return block(
      "owner_evidence_conflict",
      "Reviewed assignment inventory disagrees with analysis."
    );
  for (const a of analysis.assignments) {
    const summaries = review.assignmentReviewSummary.filter(
      (s) => s.termCode === a.termCode && s.slug === a.slug
    );
    const summary = summaries[0];
    if (
      summaries.length !== 1 ||
      !summary ||
      !same(summary.proposedOwnerGithubUserIds, a.owner.value) ||
      summary.ownerlessRepairRequired !== a.ownerlessRepairRequired ||
      (a.owner.value ?? []).some(
        (id) =>
          !review.facultyDirectory.some(
            (f) => f.github_user_id === id && f.institutional_username === a.facultyOwner
          )
      ) ||
      (a.facultyOwner === null && (!same(a.owner.value, []) || !a.ownerlessRepairRequired)) ||
      (a.facultyOwner !== null && a.ownerlessRepairRequired) ||
      (a.facultyOwner !== null &&
        a.owner.classification === "derived" &&
        a.owner.value !== null &&
        a.owner.value.length !== 1)
    )
      return block(
        "owner_evidence_conflict",
        `Owner evidence disagrees for ${a.termCode}/${a.slug}.`
      );
  }
  for (const a of analysis.assignments) {
    const start = plan.findings.length;
    const finding = (code: AssignmentMigrationFindingCode, message: string, sectionId?: string) => {
      plan.findings.push({
        code,
        message,
        termCode: a.termCode,
        assignmentSlug: a.slug,
        ...(sectionId === undefined ? {} : { sectionId })
      });
    };
    const item: AssignmentMigrationProjection = {
      termCode: a.termCode,
      assignmentSlug: a.slug,
      title: a.title,
      type: a.type,
      status: "ready",
      legacyStatus: a.status,
      preserveOperationalHistory:
        a.status === "archived" ||
        a.manifests.some(
          (m) =>
            m.provesPriorActivity ||
            m.repositories.length > 0 ||
            m.targets.length > 0 ||
            m.operations.length > 0
        ),
      owners:
        a.owner.classification !== "derived" || a.owner.value === null ? null : [...a.owner.value],
      ownerRepairRequired: a.ownerlessRepairRequired,
      ownerEvidence: structuredClone(a.owner),
      originalFacultyOwner: a.facultyOwner,
      configurationEvidence: structuredClone(a.configurationEvidence),
      deadlineEvidence: structuredClone(a.sharedDeadline),
      groupFileEvidence: structuredClone(a.groupFileEvidence),
      applyState: a.applyState,
      manifests: a.manifests.map(projectManifest),
      sections: []
    };
    if (a.ownerlessRepairRequired)
      finding(
        "owner_repair_required",
        "Ownerless assignment remains unowned pending later repair."
      );
    if (a.owner.value === null || a.owner.classification !== "derived")
      finding("owner_unresolved", "Owner evidence remains unresolved; no replacement is selected.");
    const term = analysis.terms.find((t) => t.code === a.termCode);
    const scopeConflict =
      !term ||
      new Set(a.sections).size !== a.sections.length ||
      a.sections.some((id) => !term.sections.some((s) => s.id === id)) ||
      !sameSections(a.sections, a.configurationEvidence.value.sections) ||
      (a.sharedDeadline.value.deadline !== null &&
        !sameSections(a.sections, a.sharedDeadline.value.copyToSections)) ||
      a.sharedDeadline.classification !== "derived" ||
      a.manifests.some(
        (m) =>
          m.repositories.some((r) => !a.sections.includes(r.sectionId)) ||
          m.targets.some((t) => t.sectionIds.some((id) => !a.sections.includes(id)))
      );
    if (scopeConflict)
      finding(
        "section_scope_conflict",
        "Applicable section evidence conflicts; schedule conversion is unresolved."
      );
    if (
      a.groupFileEvidence !== null ||
      a.manifests.some((m) => m.targets.length > 0) ||
      analysis.reviewDecisions.some(
        (d) => d.key === `assignments/${a.termCode}/${a.slug}/group_targets`
      )
    )
      finding(
        "group_targets_unresolved",
        "Analyzed group targets require deferred review; acknowledgement establishes no authoritative grouping."
      );
    if (a.status === "closed")
      finding(
        "legacy_closed_unresolved",
        "Legacy closed remains unresolved; no lifecycle value is selected."
      );
    if (a.status === "draft" && item.preserveOperationalHistory)
      finding(
        "draft_activity_conflict",
        "Apply or prior-activity evidence contradicts pristine Draft assumptions."
      );
    // Carry relevant analyzer diagnostics even when no more specific conversion can resolve them.
    for (const issue of analysis.issues) {
      const assignmentLocation = `terms/${a.termCode}/assignments/${a.slug}`;
      const manifestLocation = `terms/${a.termCode}/manifests/${a.slug}`;
      if (
        [assignmentLocation, manifestLocation].some(
          (prefix) =>
            issue.location === prefix ||
            issue.location.startsWith(`${prefix}/`) ||
            issue.location.startsWith(`${prefix}#`)
        )
      )
        finding("assignment_evidence_unresolved", `${issue.code}: ${issue.message}`);
    }
    const observed = a.manifests.filter((m) => m.state !== "missing");
    const conflictingManifests =
      observed.length > 1 &&
      observed.some((m) => m.contentFingerprint !== observed[0]?.contentFingerprint);
    for (const sectionId of a.sections) {
      const sectionStart = plan.findings.length;
      const states = observed.flatMap((m) =>
        m.sectionStates.filter((s) => s.sectionId === sectionId).map((s) => s.state)
      );
      let provisioning: ApplyEvidenceState = "not_observed";
      if (
        scopeConflict ||
        conflictingManifests ||
        a.applyState === "ambiguous" ||
        observed.some((m) => m.state === "invalid") ||
        states.includes("ambiguous") ||
        (observed.length > 0 && states.length !== observed.length)
      )
        provisioning = "ambiguous";
      else if (states.includes("partial_incomplete")) provisioning = "partial_incomplete";
      else if (states.length > 0 && states.every((s) => s === "complete_evidence"))
        provisioning = "complete_evidence";
      else if (
        a.applyState !== "not_observed" ||
        observed.some(
          (m) =>
            m.repositories.some((r) => r.sectionId === sectionId) ||
            m.targets.some((t) => t.sectionIds.includes(sectionId))
        )
      )
        provisioning = "ambiguous";
      if (provisioning === "partial_incomplete")
        finding(
          "apply_incomplete",
          "Interrupted or incomplete Apply; successful records must survive.",
          sectionId
        );
      if (provisioning === "ambiguous")
        finding(
          "apply_ambiguous",
          "Apply evidence cannot establish a definitive section conversion.",
          sectionId
        );
      if (
        a.manifests.some((m) =>
          m.repositories.some((r) => r.sectionId === sectionId && r.repositoryId === null)
        )
      )
        finding(
          "repository_identity_unresolved",
          "Repository record lacks an immutable ID; identity-sensitive migration requires repair.",
          sectionId
        );
      item.sections.push({
        sectionId,
        status: plan.findings.length > sectionStart ? "needs_attention" : "ready",
        schedule: scopeConflict ? null : structuredClone(a.sharedDeadline.value.deadline),
        usage:
          provisioning === "not_observed"
            ? "available"
            : provisioning === "ambiguous"
              ? "unresolved"
              : "prior_activity",
        provisioning,
        manifestEvidenceIndices: a.manifests.map((_, index) => index)
      });
    }
    if (plan.findings.length > start) item.status = "needs_attention";
    plan.assignments.push(item);
  }
  if (plan.findings.length > 0) plan.status = "needs_attention";
  return finish();
};
