import fs from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { planAssignmentMigration } from "../../../src/migration/assignment-migration-planner.js";
import { validateMigrationReview } from "../../../src/migration/migration-review-validation.js";
import type { CourseMigrationAnalysisData } from "../../../src/migration/migration-models.js";
import type { MigrationReviewResultData } from "../../../src/migration/migration-review-models.js";
import { completeSubmission, reviewFixture } from "./migration-review-fixtures.js";
import { addManifest, assignment, fixture, putTerm, term, USER_ID } from "./migration-fixtures.js";

const OWNER_ID = USER_ID + 2;

const setup = (input = fixture()) => {
  const context = reviewFixture(input);
  return {
    analysis: structuredClone(context.analysis) as CourseMigrationAnalysisData,
    review: structuredClone(
      validateMigrationReview(context, completeSubmission(context))
    ) as MigrationReviewResultData
  };
};
const first = (data = setup()) => {
  const plan = planAssignmentMigration(data.analysis, data.review);
  const item = plan.assignments[0];
  if (!item) throw new Error("Missing assignment");
  return { plan, item };
};
const inventory = (data: ReturnType<typeof setup>) => {
  const item = data.analysis.assignments[0];
  if (!item) throw new Error("Missing inventory");
  return item;
};
const frozen = (value: unknown): void => {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
};

describe("pure assignment migration planner", () => {
  it("accepts a completed matching review without authorizing publication", () => {
    const { plan } = first();
    expect(plan.status).toBe("ready");
    expect(plan.publicationReady).toBe(false);
  });
  it.each(["incomplete", "stale", "blocked", "not_applicable"] as const)(
    "blocks %s review",
    (status) => {
      const data = setup();
      data.review.status = status;
      expect(planAssignmentMigration(data.analysis, data.review)).toMatchObject({
        status: "blocked",
        assignments: []
      });
    }
  );
  it.each(["repositoryId", "sourceCommitSha", "reportId", "authenticatedGithubUserId"] as const)(
    "blocks mismatched %s",
    (key) => {
      const data = setup();
      Object.assign(data.review.source, {
        [key]: typeof data.review.source[key] === "number" ? USER_ID + 1 : "other"
      });
      expect(planAssignmentMigration(data.analysis, data.review).status).toBe("blocked");
    }
  );
  it.each([{ kind: "other" }, { publicationReady: true }])(
    "blocks invalid review authority %j",
    (change) => {
      const data = setup();
      Object.assign(data.review, change);
      expect(planAssignmentMigration(data.analysis, data.review).status).toBe("blocked");
    }
  );
  it("preserves matching not-applicable and rejects mismatched not-applicable", () => {
    const data = setup();
    data.analysis.status = "not_applicable";
    data.review.status = "not_applicable";
    expect(planAssignmentMigration(data.analysis, data.review)).toMatchObject({
      status: "not_applicable",
      assignments: []
    });
    Object.assign(data.review.source, { reportId: "other" });
    expect(planAssignmentMigration(data.analysis, data.review).status).toBe("blocked");
  });
  it("preserves exact resolved GitHub owner ID", () => {
    expect(first().item.owners).toEqual([OWNER_ID]);
  });
  it("keeps ownerless assignments empty despite fallback/coordinator/current/section faculty", () => {
    const input = fixture();
    const config = structuredClone(assignment);
    delete config.metadata;
    putTerm(input, term, [config]);
    const { plan, item } = first(setup(input));
    expect(item.owners).toEqual([]);
    expect(item.ownerRepairRequired).toBe(true);
    expect(plan.findings.some((f) => f.code === "owner_repair_required")).toBe(true);
  });
  it("keeps unresolved owners unresolved", () => {
    const data = setup();
    inventory(data).owner.value = null;
    inventory(data).owner.classification = "unresolved";
    const summary = data.review.assignmentReviewSummary[0];
    if (summary) summary.proposedOwnerGithubUserIds = null;
    expect(first(data).item).toMatchObject({ status: "needs_attention", owners: null });
  });
  it.each(["summary", "directory"])("fails closed for conflicting owner %s", (variant) => {
    const data = setup();
    if (variant === "directory") data.review.facultyDirectory = [];
    else {
      const summary = data.review.assignmentReviewSummary[0];
      if (summary) summary.proposedOwnerGithubUserIds = [USER_ID];
    }
    expect(planAssignmentMigration(data.analysis, data.review).status).toBe("blocked");
  });
  it("fans out exact deadline values to every canonical section", () => {
    expect(first().item.sections.map((s) => s.schedule)).toEqual([
      assignment.deadline,
      assignment.deadline
    ]);
  });
  it("does not invent missing deadline values", () => {
    const input = fixture();
    const config = structuredClone(assignment);
    delete config.deadline;
    putTerm(input, term, [config]);
    expect(first(setup(input)).item.sections.map((s) => s.schedule)).toEqual([null, null]);
  });
  it("preserves section scope conflicts without inventing destinations", () => {
    const data = setup();
    inventory(data).sharedDeadline.value.copyToSections = ["001"];
    const { item, plan } = first(data);
    expect(item.sections.map((s) => s.sectionId)).toEqual(["001", "002"]);
    expect(item.sections.every((s) => s.schedule === null)).toBe(true);
    expect(plan.findings.some((f) => f.code === "section_scope_conflict")).toBe(true);
  });
  it("reliable absence means available/not applied, never not using", () => {
    expect(first().item.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ usage: "available", provisioning: "not_observed" })
      ])
    );
  });
  it("projects complete section evidence with exact repository IDs and source provenance", () => {
    const input = fixture();
    addManifest(input);
    const { item } = first(setup(input));
    expect(item.sections.every((s) => s.provisioning === "complete_evidence")).toBe(true);
    expect(item.manifests[0]).toMatchObject({
      provenance: "source",
      repositories: [
        expect.objectContaining({ repositoryId: USER_ID }),
        expect.objectContaining({ repositoryId: USER_ID + 1 })
      ]
    });
  });
  it("preserves successful records through interrupted Apply", () => {
    const input = fixture();
    addManifest(input, (m) => {
      const op = m.operation_history[0];
      if (op) {
        op.status = "failure";
        delete op.completed_at;
      }
    });
    const { plan, item } = first(setup(input));
    expect(item.sections.every((s) => s.provisioning === "partial_incomplete")).toBe(true);
    expect(item.manifests[0]?.repositories).toHaveLength(2);
    expect(plan.findings.some((f) => f.code === "apply_incomplete")).toBe(true);
  });
  it("never upgrades assignment-wide partial state into complete sections", () => {
    const data = setup();
    inventory(data).applyState = "partial_incomplete";
    inventory(data).manifests.forEach((m) => {
      m.state = "loaded";
      m.applyState = "partial_incomplete";
      m.sectionStates = [];
    });
    expect(first(data).item.sections.every((s) => s.provisioning !== "complete_evidence")).toBe(
      true
    );
  });
  it("preserves conflicting source/runtime evidence and machine-local provenance", () => {
    const input = fixture();
    addManifest(input);
    const data = setup(input);
    const item = inventory(data);
    item.applyState = "ambiguous";
    const source = item.manifests[0];
    if (!source) throw new Error("Missing manifest");
    item.manifests.push({
      ...structuredClone(source),
      provenance: "runtime",
      contentFingerprint: "other"
    });
    const result = first(data);
    expect(result.item.sections.every((s) => s.provisioning === "ambiguous")).toBe(true);
    expect(result.item.manifests[item.manifests.length - 1]?.provenance).toBe("runtime");
    expect(result.plan.runtimeCoverage).toBe(data.analysis.runtimeCoverage);
  });
  it("preserves null repository IDs and structural group/target evidence as unresolved", () => {
    const input = fixture();
    addManifest(input);
    const data = setup(input);
    const item = inventory(data);
    const manifest = item.manifests[0];
    if (!manifest) throw new Error("Missing manifest");
    const repo = manifest.repositories[0];
    if (repo) repo.repositoryId = null;
    manifest.targets = [
      {
        targetId: "group-a",
        sectionIds: ["001", "002"],
        studentIds: ["a", "b"],
        repositoryName: "group-a",
        lifecycle: null
      }
    ];
    item.groupFileEvidence = {
      classification: "requires_confirmation",
      value: { path: "groups.csv", present: true, contentFingerprint: "group-hash" },
      evidence: ["analyzed"]
    };
    const result = first(data);
    expect(result.item.manifests[0]?.targets).toEqual(manifest.targets);
    expect(result.item.manifests[0]?.repositories[0]?.repositoryId).toBeNull();
    expect(result.plan.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["repository_identity_unresolved", "group_targets_unresolved"])
    );
  });
  it.each(["draft", "active", "archived", "closed"])("retains legacy %s lifecycle", (status) => {
    const input = fixture();
    const config = structuredClone(assignment);
    config.assignment.status = status;
    putTerm(input, term, [config]);
    const { item } = first(setup(input));
    expect(item.legacyStatus).toBe(status);
    expect(item.preserveOperationalHistory).toBe(status === "archived");
    expect(item.status).toBe(status === "closed" ? "needs_attention" : "ready");
  });
  it("draft with source or runtime activity remains Needs attention", () => {
    const data = setup();
    const item = inventory(data);
    item.status = "draft";
    const manifest = item.manifests[1];
    if (manifest)
      manifest.operations.push({
        command: "apply",
        status: "failed",
        completed: false,
        startedAt: "observed",
        completedAt: null
      });
    expect(first(data).plan.findings.some((f) => f.code === "draft_activity_conflict")).toBe(true);
  });
  it("retains grader evidence for 9.4 and organization publication conditions separately", () => {
    const data = setup();
    data.review.organizationCondition = "organization_migration_required";
    const { plan } = first(data);
    expect(plan.status).toBe("ready");
    expect(plan.organizationCondition).toBe("organization_migration_required");
    expect(plan.grader.removalPhase).toBe("9.4");
    expect(plan.grader.evidence).toEqual(data.analysis.grader.evidence);
    expect(plan.publicationBlockers).toEqual(data.review.publicationBlockers);
  });
  it("a v1 course with no assignments has no assignment conversion", () => {
    const input = fixture();
    putTerm(input, term, []);
    const data = setup(input);
    expect(planAssignmentMigration(data.analysis, data.review)).toMatchObject({
      status: "not_applicable",
      assignments: []
    });
  });
  it("preserves complete section evidence independently of an incomplete sibling", () => {
    const input = fixture();
    addManifest(input, (m) => {
      m.repositories.pop();
    });
    const { item } = first(setup(input));
    expect(item.sections.map((s) => s.provisioning)).toEqual([
      "complete_evidence",
      "partial_incomplete"
    ]);
    expect(item.status).toBe("needs_attention");
  });
  it("a conflicting owner fact cannot become an authoritative owner array", () => {
    const data = setup();
    inventory(data).owner.classification = "blocking";
    expect(first(data).item).toMatchObject({ owners: null, status: "needs_attention" });
  });
  it("does not bind an owner ID to another directory identity", () => {
    const data = setup();
    const owner = data.review.facultyDirectory.find((f) => f.github_user_id === OWNER_ID);
    if (owner) owner.institutional_username = "someone-else";
    expect(planAssignmentMigration(data.analysis, data.review).status).toBe("blocked");
  });
  it("retains source versus machine-local evidence even when fingerprints match", () => {
    const input = fixture();
    addManifest(input);
    const data = setup(input);
    const item = inventory(data);
    const source = item.manifests[0];
    if (!source) throw new Error("Missing manifest");
    item.manifests[1] = {
      ...structuredClone(source),
      provenance: "runtime",
      provesPriorActivity: false
    };
    data.analysis.runtimeCoverage = "machine_local";
    const result = first(data);
    expect(result.item.manifests.map((m) => m.provenance)).toEqual(["source", "runtime"]);
    expect(result.item.manifests.map((m) => m.provesPriorActivity)).toEqual([true, false]);
    expect(result.item.sections.every((s) => s.provisioning === "complete_evidence")).toBe(true);
  });
  it("does not broaden section scope from manifest records", () => {
    const input = fixture();
    addManifest(input);
    const data = setup(input);
    const item = inventory(data);
    const record = item.manifests[0]?.repositories[0];
    if (record) record.sectionId = "999";
    const result = first(data);
    expect(result.item.sections.map((s) => s.sectionId)).toEqual(["001", "002"]);
    expect(result.plan.findings.some((f) => f.code === "section_scope_conflict")).toBe(true);
  });
  it("accepts exact frozen analyzer/review objects", () => {
    const context = reviewFixture();
    const review = validateMigrationReview(context, completeSubmission(context));
    expect(planAssignmentMigration(context.analysis, review).status).toBe("ready");
  });
  it("has no runtime dependencies or ambient I/O/Git/GitHub capabilities", () => {
    const source = fs.readFileSync("src/migration/assignment-migration-planner.ts", "utf8");
    const ast = ts.createSourceFile("planner.ts", source, ts.ScriptTarget.Latest, true);
    const inspect = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node))
        expect(node.importClause?.phaseModifier).toBe(ts.SyntaxKind.TypeKeyword);
      if (ts.isCallExpression(node)) {
        expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
        if (ts.isIdentifier(node.expression))
          expect(["require", "fetch", "eval"]).not.toContain(node.expression.text);
      }
      if (ts.isIdentifier(node))
        expect([
          "process",
          "globalThis",
          "Date",
          "Math",
          "XMLHttpRequest",
          "WebSocket"
        ]).not.toContain(node.text);
      ts.forEachChild(node, inspect);
    };
    inspect(ast);
  });
  it("is deterministic, detached, deeply frozen and never modifies/freezes inputs", () => {
    const input = fixture();
    addManifest(input);
    const data = setup(input);
    const before = structuredClone(data);
    const plan = planAssignmentMigration(data.analysis, data.review);
    expect(plan).toEqual(planAssignmentMigration(data.analysis, data.review));
    frozen(plan);
    expect(data).toEqual(before);
    expect(Object.isFrozen(data.analysis)).toBe(false);
    inventory(data).manifests[0]?.repositories.splice(0);
    data.review.publicationBlockers.push("caller mutation");
    expect(plan).toEqual(planAssignmentMigration(before.analysis, before.review));
  });
});
