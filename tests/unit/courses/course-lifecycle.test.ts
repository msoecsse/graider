import { describe, expect, it } from "vitest";
import {
  rawCourseConfigV1Schema,
  rawCourseConfigV2Schema,
  COURSE_LIFECYCLE_STATUSES
} from "../../../src/config/config-schemas.js";
import {
  CourseLifecycle,
  checkCourseCreationLifecycle,
  projectCourseLifecycle
} from "../../../src/courses/course-lifecycle.js";
import { CourseLifecycleAuthorizationResolver } from "../../../src/faculty/course-lifecycle-authorization-resolver.js";
import { ArchivedTermAuthorizationResolver } from "../../../src/faculty/archived-term-authorization-resolver.js";
import { buildLifecycleTeamMemberships } from "../../../src/github/lifecycle-team-membership.js";
import {
  course as base,
  active,
  draft,
  archived,
  COORDINATOR,
  FACULTY,
  FORMER,
  DIRECTORY_ONLY,
  FALLBACK,
  REPOSITORY_ID
} from "../terms/activation-fixtures.js";
import type { RawCourseConfigV2, RawTermConfigV2 } from "../../../src/config/config-models.js";
import { activationRecoveryCheckpointSchema } from "../../../src/terms/activation-recovery-checkpoint.js";
import fs from "node:fs";
import { parse } from "yaml";

const clear = { complete: true, checkpoints: [] };
const old = { ...active, term: { ...active.term, status: "archived" as const } };
const recent = {
  ...archived,
  coordinators: { current: [{ github_user_id: FACULTY }], former: [{ github_user_id: FORMER }] }
};
// The older academic year is intentionally the most recently CREATED existing term.
const terms = [old, recent];
const withTerms = (
  inputs: readonly RawTermConfigV2[],
  status: "unarchived" | "archived" = "unarchived"
): RawCourseConfigV2 => ({
  ...structuredClone(base),
  course: {
    ...base.course,
    lifecycle: status,
    term_creation_order: inputs.map((term) => term.term.code)
  }
});
const course = withTerms(terms);
const shaLength = 40;
const checkpoint = activationRecoveryCheckpointSchema.parse({
  schema_version: 1,
  activation_id: "00000000-0000-4000-8000-000000000001",
  course_repository_id: REPOSITORY_ID,
  activated_from_revision: "a".repeat(shaLength),
  target_term_code: active.term.code,
  previous_active_term_code: null,
  activating_github_user_id: COORDINATOR,
  state: "rollback_available"
});

describe("strict v2 course lifecycle schema", () => {
  it.each(COURSE_LIFECYCLE_STATUSES)("accepts explicit %s", (lifecycle) => {
    expect(
      rawCourseConfigV2Schema.parse({ ...course, course: { ...course.course, lifecycle } }).course
        .lifecycle
    ).toBe(lifecycle);
  });
  it.each([undefined, "active", null])("rejects missing/unknown lifecycle %j", (lifecycle) => {
    expect(
      rawCourseConfigV2Schema.safeParse({ ...course, course: { ...course.course, lifecycle } })
        .success
    ).toBe(false);
  });
  it.each([undefined, null, ["bad"], [old.term.code, old.term.code]])(
    "rejects invalid creation fact %j",
    (term_creation_order) => {
      expect(
        rawCourseConfigV2Schema.safeParse({
          ...course,
          course: { ...course.course, term_creation_order }
        }).success
      ).toBe(false);
    }
  );
  it("leaves v1 unchanged and strict", () => {
    const v1 = rawCourseConfigV1Schema.parse(
      parse(fs.readFileSync("tests/fixtures/config/valid-course/course.yml", "utf8"))
    );
    expect(rawCourseConfigV1Schema.parse(v1)).toEqual(v1);
    expect(
      rawCourseConfigV1Schema.safeParse({ ...v1, course: { ...v1.course, lifecycle: "archived" } })
        .success
    ).toBe(false);
  });
});

describe("complete immutable course lifecycle snapshot", () => {
  it.each([[], [old], terms].map((inputs) => ({ inputs })))(
    "archives Archived-only or empty set %#",
    ({ inputs }) => {
      const model = new CourseLifecycle(withTerms(inputs), inputs, clear);
      expect(model.canArchiveState()).toEqual({ allowed: true, basis: "archive-guards-satisfied" });
      expect(() => {
        model.assertArchiveGuards();
      }).not.toThrow();
    }
  );
  it.each([active, draft, { ...draft, term: { ...draft.term, has_ever_been_active: true } }])(
    "never fixes a blocking term %#",
    (term) => {
      const before = structuredClone(term);
      const model = new CourseLifecycle(withTerms([term]), [term], clear);
      expect(model.canArchiveState().basis).toBe(
        term.term.status === "active" ? "active-term-exists" : "draft-term-exists"
      );
      expect(() => {
        model.assertArchiveGuards();
      }).toThrow();
      expect(term).toEqual(before);
    }
  );
  it("requires complete checkpoint evidence and rejects malformed/contradictory records", () => {
    expect(new CourseLifecycle(course, terms).canArchiveState().basis).toBe(
      "recovery-state-unknown"
    );
    expect(
      new CourseLifecycle(course, terms, { complete: false, checkpoints: [] }).canArchiveState()
        .allowed
    ).toBe(false);
    for (const bad of [{}, { ...checkpoint, schema_version: 2 }, checkpoint]) {
      expect(
        new CourseLifecycle(course, terms, { complete: true, checkpoints: [bad] }).canArchiveState()
          .basis
      ).toBe("recovery-state-invalid");
    }
    expect(
      new CourseLifecycle(withTerms([active]), [active], {
        complete: true,
        checkpoints: [checkpoint]
      }).canArchiveState().basis
    ).toBe("activation-recovery-unresolved");
  });
  it("rejects missing/dangling/incomplete references and duplicate/multiple-Active terms", () => {
    for (const codes of [[], [old.term.code], [old.term.code, "99s1"]]) {
      expect(
        () =>
          new CourseLifecycle(
            { ...course, course: { ...course.course, term_creation_order: codes } },
            terms,
            clear
          )
      ).toThrow("creation order");
    }
    expect(() => new CourseLifecycle(withTerms([]), terms, clear)).toThrow();
    expect(() => new CourseLifecycle(course, [old, old], clear)).toThrow("Duplicate");
    expect(
      () =>
        new CourseLifecycle(
          withTerms([
            active,
            { ...draft, term: { ...draft.term, status: "active", has_ever_been_active: true } }
          ]),
          [
            active,
            { ...draft, term: { ...draft.term, status: "active", has_ever_been_active: true } }
          ],
          clear
        )
    ).toThrow("at most one");
    expect(() => new CourseLifecycle(withTerms([active], "archived"), [active], clear)).toThrow(
      "non-Archived"
    );
  });
  it("uses explicit creation fact independently of input order, dates, and caller mutations", () => {
    const inputCourse = structuredClone(course);
    const inputTerms = structuredClone(terms).reverse();
    const model = new CourseLifecycle(inputCourse, inputTerms, clear);
    expect(model.getMostRecentTerm()?.term.code).toBe(recent.term.code);
    inputCourse.course.lifecycle = "archived";
    inputCourse.course.term_creation_order.reverse();
    inputTerms.splice(0);
    expect(model.getStatus()).toBe("unarchived");
    expect(model.getMostRecentTerm()?.term.code).toBe(recent.term.code);
    expect(Object.isFrozen(model.getMostRecentTerm()?.coordinators.current)).toBe(true);
    expect(Object.isFrozen(model.canArchiveState())).toBe(true);
  });
});

describe("course lifecycle authority", () => {
  it.each([FALLBACK, FACULTY, COORDINATOR, FORMER, DIRECTORY_ONLY])(
    "archive and unarchive actor %s",
    (actor) => {
      for (const lifecycle of COURSE_LIFECYCLE_STATUSES) {
        const resolver = new CourseLifecycleAuthorizationResolver(
          withTerms(terms, lifecycle),
          [...terms].reverse(),
          actor,
          clear
        );
        const result =
          lifecycle === "unarchived" ? resolver.canArchiveCourse() : resolver.canUnarchiveCourse();
        expect(result.allowed).toBe(actor === FALLBACK || actor === FACULTY);
        expect(Object.isFrozen(result)).toBe(true);
      }
    }
  );
  it("does not derive authority from ordinary faculty in the latest term", () => {
    const latest = {
      ...old,
      coordinators: {
        current: [{ github_user_id: COORDINATOR }],
        former: [{ github_user_id: FORMER }]
      }
    };
    expect(
      new CourseLifecycleAuthorizationResolver(
        withTerms([latest]),
        [latest],
        FACULTY,
        clear
      ).canArchiveCourse().allowed
    ).toBe(false);
  });
  it("zero terms grant authority only to fallback and no term is invented", () => {
    for (const actor of [FALLBACK, COORDINATOR, FACULTY, FORMER]) {
      const resolver = new CourseLifecycleAuthorizationResolver(withTerms([]), [], actor, clear);
      expect(resolver.canArchiveCourse().allowed).toBe(actor === FALLBACK);
      expect(resolver.lifecycle.getMostRecentTerm()).toBeUndefined();
    }
  });
  it("reports archive guards separately from authority and same-state transitions", () => {
    expect(
      new CourseLifecycleAuthorizationResolver(
        withTerms([draft]),
        [draft],
        FALLBACK,
        clear
      ).canArchiveCourse().basis
    ).toBe("draft-term-exists");
    expect(
      new CourseLifecycleAuthorizationResolver(course, terms, FALLBACK, clear).canUnarchiveCourse()
        .basis
    ).toBe("already-unarchived");
    expect(
      new CourseLifecycleAuthorizationResolver(
        withTerms(terms, "archived"),
        terms,
        FALLBACK,
        clear
      ).canArchiveCourse().basis
    ).toBe("already-archived");
  });
});

describe("archived course operation and projection policy", () => {
  it.each(["create-term", "create-assignment"] as const)(
    "blocks only lifecycle creation %s",
    (operation) => {
      expect(checkCourseCreationLifecycle(withTerms(terms, "archived"), operation)).toMatchObject({
        allowed: false,
        basis: "course-archived"
      });
      expect(checkCourseCreationLifecycle(course, operation)).toMatchObject({
        allowed: true,
        basis: "role-authorization-required"
      });
      expect(() => checkCourseCreationLifecycle(course, "grading" as never)).toThrow();
    }
  );
  it.each([COORDINATOR, FACULTY, FORMER, FALLBACK])(
    "preserves historical late work and desired teams for actor %s",
    (actor) => {
      const archivedCourse = withTerms(terms, "archived");
      const before = new ArchivedTermAuthorizationResolver(course, terms, old.term.code, actor);
      const after = new ArchivedTermAuthorizationResolver(
        archivedCourse,
        terms,
        old.term.code,
        actor
      );
      for (const operation of [
        "inspect",
        "grading",
        "grading-dispatch",
        "report-publication"
      ] as const) {
        for (const scope of ["default", "coordinator-term"] as const) {
          expect(after.canPerformArchivedSectionOperation(operation, "001", scope)).toEqual(
            before.canPerformArchivedSectionOperation(operation, "001", scope)
          );
        }
      }
      expect(buildLifecycleTeamMemberships(archivedCourse, terms, REPOSITORY_ID)).toEqual(
        buildLifecycleTeamMemberships(course, terms, REPOSITORY_ID)
      );
      if (actor === FACULTY) {
        expect(after.canPerformArchivedSectionOperation("grading", "001").allowed).toBe(true);
        expect(after.canPerformArchivedSectionOperation("report-publication", "001").allowed).toBe(
          true
        );
      }
      if (actor === FORMER)
        expect(after.canPerformArchivedSectionOperation("inspect", "001").allowed).toBe(true);
    }
  );
  it.each([false, true])(
    "shared archive and local hide/show stay independent (showArchived=%s)",
    (showArchived) => {
      for (const locallyHidden of [false, true]) {
        const projection = projectCourseLifecycle(withTerms(terms, "archived"), {
          showArchived,
          locallyHidden
        });
        expect(projection.dashboardVisible).toBe(showArchived && !locallyHidden);
        expect(projection).toMatchObject({
          discoveryEligible: true,
          synchronizationEligible: true,
          bootstrapEligible: true
        });
        expect(
          projectCourseLifecycle(course, { showArchived, locallyHidden }).dashboardVisible
        ).toBe(!locallyHidden);
        expect(Object.isFrozen(projection)).toBe(true);
      }
    }
  );
});
