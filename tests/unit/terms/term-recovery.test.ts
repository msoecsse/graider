import { describe, expect, it } from "vitest";
import {
  DraftDeletionAuthorizationResolver,
  TermActivationRecoveryAuthorizationResolver
} from "../../../src/faculty/term-recovery-authorization.js";
import {
  activationRecoveryCheckpointSchema,
  requireNoTermActivity,
  validateRecoveryCheckpoint,
  STUDENT_ACTIVITY_CATEGORIES,
  type ActivityEvidenceContext
} from "../../../src/terms/activation-recovery-checkpoint.js";
import {
  planDraftDeletion,
  planActivationRecovery
} from "../../../src/terms/term-recovery-plan.js";
import { planTermActivation } from "../../../src/terms/term-activation.js";
import { assertNoKnownStudentTargets } from "../../../src/terms/term-recovery-metadata.js";
import {
  CourseTermLifecycle,
  canTransitionTermStatus
} from "../../../src/terms/course-term-lifecycle.js";
import { rawTermConfigV2Schema } from "../../../src/config/config-schemas.js";
import { ArchivedTermAuthorizationResolver } from "../../../src/faculty/archived-term-authorization-resolver.js";
import {
  course,
  terms,
  active,
  draft,
  FALLBACK,
  COORDINATOR,
  FACULTY,
  FORMER,
  DIRECTORY_ONLY,
  REPOSITORY_ID,
  existingStudentTarget
} from "./activation-fixtures.js";

const SHA_LENGTH = 40;
const REVISION = "a".repeat(SHA_LENGTH);
const ACTIVATION_ID = "00000000-0000-4000-8000-000000000001";
const context: ActivityEvidenceContext = {
  courseRepositoryId: REPOSITORY_ID,
  revision: REVISION,
  termCode: draft.term.code,
  authenticatedGithubUserId: FALLBACK
};
const evidence = {
  schema_version: 1,
  source: "trusted-remote",
  course_repository_id: REPOSITORY_ID,
  revision: REVISION,
  term_code: draft.term.code,
  authenticated_github_user_id: FALLBACK,
  categories: Object.fromEntries(
    STUDENT_ACTIVITY_CATEGORIES.map((category) => [category, "absent"])
  )
};
const activated = planTermActivation(course, terms, draft.term.code, FALLBACK).after.map((term) =>
  rawTermConfigV2Schema.parse(term)
);
const checkpoint = activationRecoveryCheckpointSchema.parse({
  schema_version: 1,
  activation_id: ACTIVATION_ID,
  course_repository_id: REPOSITORY_ID,
  activated_from_revision: REVISION,
  target_term_code: draft.term.code,
  previous_active_term_code: active.term.code,
  activating_github_user_id: FALLBACK,
  state: "rollback_available"
});
const required = activationRecoveryCheckpointSchema.parse({
  ...checkpoint,
  state: "recovery_required",
  first_activity: {
    category: "apply",
    actor_github_user_id: FACULTY,
    recorded_at: "2026-11-02T12:00:00Z"
  }
});

describe("dedicated Draft deletion and recovery authority", () => {
  it("does not grant initial deletion to a section faculty member without a coordinator role", () => {
    const teachingOnly = structuredClone(draft);
    teachingOnly.coordinators.current = [{ github_user_id: COORDINATOR }];
    expect(
      new DraftDeletionAuthorizationResolver(
        course,
        [teachingOnly],
        draft.term.code,
        FACULTY
      ).canDeleteDraft().allowed
    ).toBe(false);
  });
  it.each([COORDINATOR, FALLBACK, FACULTY, FORMER, DIRECTORY_ONLY])(
    "Draft deletion with Active, actor %s",
    (actor) => {
      expect(
        new DraftDeletionAuthorizationResolver(
          course,
          terms,
          draft.term.code,
          actor
        ).canDeleteDraft().allowed
      ).toBe(actor === COORDINATOR || actor === FALLBACK);
    }
  );
  it.each([COORDINATOR, FALLBACK, FACULTY, FORMER, DIRECTORY_ONLY])(
    "Draft deletion with zero Active, actor %s",
    (actor) => {
      expect(
        new DraftDeletionAuthorizationResolver(
          course,
          [draft],
          draft.term.code,
          actor
        ).canDeleteDraft().allowed
      ).toBe(actor === FACULTY || actor === FALLBACK);
    }
  );
  it.each([COORDINATOR, FALLBACK, FACULTY, FORMER, DIRECTORY_ONLY])(
    "recovery follows current Active authority, actor %s",
    (actor) => {
      expect(
        new TermActivationRecoveryAuthorizationResolver(
          course,
          activated,
          draft.term.code,
          actor
        ).canRecoverActivation().allowed
      ).toBe(actor === FACULTY || actor === FALLBACK);
    }
  );
  it("snapshots immutable decisions and never deletes an ever-Active Draft", () => {
    const input = structuredClone(terms);
    const auth = new DraftDeletionAuthorizationResolver(
      course,
      input,
      draft.term.code,
      COORDINATOR
    );
    input.splice(0);
    expect(auth.canDeleteDraft().allowed).toBe(true);
    expect(Object.isFrozen(auth.canDeleteDraft())).toBe(true);
    expect(
      new DraftDeletionAuthorizationResolver(
        course,
        [{ ...draft, term: { ...draft.term, has_ever_been_active: true } }],
        draft.term.code,
        FALLBACK
      ).canDeleteDraft().basis
    ).toBe("ever-active-deletion-prohibited");
    expect(
      () => new DraftDeletionAuthorizationResolver(course, terms, active.term.code, FALLBACK)
    ).toThrow("Draft target");
  });
});

describe("bound cross-machine activity evidence", () => {
  it("blocks a trusted provisioned repository even if an absence reader would claim no activity", () => {
    expect(() => {
      assertNoKnownStudentTargets(draft.term.code, [
        { ...existingStudentTarget, termCode: draft.term.code }
      ]);
    }).toThrow("activity_present");
    expect(() => {
      assertNoKnownStudentTargets(draft.term.code, [existingStudentTarget]);
    }).not.toThrow();
  });
  it("requires complete exact-source evidence, never local absence", () => {
    expect(() => {
      requireNoTermActivity(evidence, context);
    }).not.toThrow();
    for (const invalid of [
      undefined,
      {},
      { ...evidence, source: "local-runtime" },
      { ...evidence, revision: "b".repeat(SHA_LENGTH) },
      { ...evidence, course_repository_id: REPOSITORY_ID + 1 },
      { ...evidence, term_code: "99s1" },
      { ...evidence, authenticated_github_user_id: FACULTY },
      { ...evidence, categories: { apply: "absent" } }
    ]) {
      expect(() => {
        requireNoTermActivity(invalid, context);
      }).toThrow("activity_unknown");
    }
  });
  it.each(STUDENT_ACTIVITY_CATEGORIES)(
    "present/unknown %s blocks deletion and safe rollback",
    (category) => {
      for (const value of ["present", "unknown"]) {
        const record = { ...evidence, categories: { ...evidence.categories, [category]: value } };
        expect(() => planDraftDeletion(course, terms, context, record, false)).toThrow(
          value === "present" ? "activity_present" : "activity_unknown"
        );
        expect(() =>
          planActivationRecovery(
            course,
            activated,
            context,
            checkpoint,
            ACTIVATION_ID,
            "safe-rollback",
            record
          )
        ).toThrow();
      }
    }
  );
});

describe("strict recovery checkpoint", () => {
  it.each([
    undefined,
    {},
    { ...checkpoint, schema_version: 2 },
    { ...checkpoint, activation_id: "bad" },
    { ...checkpoint, state: "resolved" },
    { ...checkpoint, state: "recovery_required" },
    { ...required, state: "rollback_available" },
    { ...checkpoint, extra: true },
    { ...checkpoint, previous_active_term_code: draft.term.code }
  ])("rejects malformed/missing/unsupported %j", (input) => {
    expect(() =>
      validateRecoveryCheckpoint(
        input,
        new CourseTermLifecycle(activated),
        REPOSITORY_ID,
        draft.term.code
      )
    ).toThrow();
  });
  it("rejects course, target, predecessor and identity contradictions without recreating removed terms", () => {
    for (const input of [
      { ...checkpoint, course_repository_id: REPOSITORY_ID + 1 },
      { ...checkpoint, target_term_code: active.term.code },
      { ...checkpoint, previous_active_term_code: "99s1" }
    ]) {
      expect(() =>
        planActivationRecovery(
          course,
          activated,
          context,
          input,
          ACTIVATION_ID,
          "safe-rollback",
          evidence
        )
      ).toThrow();
    }
    expect(() =>
      planActivationRecovery(
        course,
        activated.filter((term) => term.term.code !== active.term.code),
        context,
        checkpoint,
        ACTIVATION_ID,
        "safe-rollback",
        evidence
      )
    ).toThrow("predecessor_missing");
    expect(() =>
      planActivationRecovery(
        course,
        activated,
        context,
        checkpoint,
        "old-activation",
        "safe-rollback",
        evidence
      )
    ).toThrow("identity changed");
  });
});

describe("immutable deletion/recovery plans", () => {
  it("deletes only a never-Active Draft and rejects recovery evidence", () => {
    const plan = planDraftDeletion(course, terms, context, evidence, false);
    expect(plan.after).toEqual(terms.filter((term) => term.term.code !== draft.term.code));
    expect(plan.before).toEqual(terms);
    expect(() => planDraftDeletion(course, terms, context, evidence, true)).toThrow(
      "recovery evidence"
    );
    expect(Object.isFrozen(plan.after)).toBe(true);
  });
  it("safely restores the predecessor and retains irreversible target history and every role", () => {
    const before = structuredClone(activated);
    const plan = planActivationRecovery(
      course,
      activated,
      context,
      checkpoint,
      ACTIVATION_ID,
      "safe-rollback",
      evidence
    );
    if ("status" in plan) throw new Error("Expected safe rollback.");
    expect(
      new CourseTermLifecycle(
        plan.after.map((term) => rawTermConfigV2Schema.parse(term))
      ).requireActiveTerm().term.code
    ).toBe(active.term.code);
    expect(plan.after.find((term) => term.term.code === draft.term.code)?.term).toMatchObject({
      status: "draft",
      has_ever_been_active: true
    });
    for (const term of plan.before) {
      const after = plan.after.find((entry) => entry.term.code === term.term.code);
      expect(after?.coordinators).toEqual(term.coordinators);
      expect(after?.sections).toEqual(term.sections);
    }
    expect(activated).toEqual(before);
    expect(Object.isFrozen(plan.after[0]?.coordinators)).toBe(true);
  });
  it("initial rollback permits zero Active but can never make the term deletable", () => {
    const initial = planTermActivation(course, [draft], draft.term.code, FALLBACK).after.map(
      (term) => rawTermConfigV2Schema.parse(term)
    );
    const plan = planActivationRecovery(
      course,
      initial,
      context,
      { ...checkpoint, previous_active_term_code: null },
      ACTIVATION_ID,
      "safe-rollback",
      evidence
    );
    if ("status" in plan) throw new Error("Expected rollback.");
    const after = plan.after.map((term) => rawTermConfigV2Schema.parse(term));
    expect(new CourseTermLifecycle(after).getActiveTerm()).toBeUndefined();
    expect(() => planDraftDeletion(course, after, context, evidence, false)).toThrow(
      "ever-active-deletion-prohibited"
    );
  });
  it("durable activity intent forbids simple rollback even if runtime/evidence currently looks empty", () => {
    expect(
      planActivationRecovery(
        course,
        activated,
        context,
        required,
        ACTIVATION_ID,
        "safe-rollback",
        evidence
      )
    ).toEqual({ status: "recovery_required", activationId: ACTIVATION_ID });
  });
  it("accept-current preserves lifecycle; predecessor restoration archives the mistaken term and retains late work", () => {
    const accept = planActivationRecovery(
      course,
      activated,
      context,
      required,
      ACTIVATION_ID,
      "accept-current"
    );
    if ("status" in accept) throw new Error("Expected accept.");
    expect(accept.after).toEqual(activated);
    expect(accept.changedTermCodes).toEqual([]);
    const restore = planActivationRecovery(
      course,
      activated,
      context,
      required,
      ACTIVATION_ID,
      "restore-predecessor"
    );
    if ("status" in restore) throw new Error("Expected restoration.");
    const after = restore.after.map((term) => rawTermConfigV2Schema.parse(term));
    expect(new CourseTermLifecycle(after).requireActiveTerm().term.code).toBe(active.term.code);
    expect(after.find((term) => term.term.code === draft.term.code)?.term).toMatchObject({
      status: "archived",
      has_ever_been_active: true
    });
    expect(
      new ArchivedTermAuthorizationResolver(
        course,
        after,
        draft.term.code,
        FACULTY
      ).canPerformArchivedSectionOperation("grading", "001", "coordinator-term").allowed
    ).toBe(true);
  });
  it("does not restore a nonexistent initial predecessor or weaken normal transition helpers", () => {
    const initial = planTermActivation(course, [draft], draft.term.code, FALLBACK).after.map(
      (term) => rawTermConfigV2Schema.parse(term)
    );
    expect(() =>
      planActivationRecovery(
        course,
        initial,
        context,
        { ...required, previous_active_term_code: null },
        ACTIVATION_ID,
        "restore-predecessor"
      )
    ).toThrow("no predecessor");
    expect(canTransitionTermStatus("active", "draft")).toBe(false);
    expect(canTransitionTermStatus("archived", "active")).toBe(false);
  });
});
