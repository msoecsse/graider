import { describe, expect, it } from "vitest";
import type { RawTermConfigV2, TermLifecycleStatus } from "../../../src/config/config-models.js";
import { TERM_LIFECYCLE_STATUSES } from "../../../src/config/config-schemas.js";
import {
  CourseTermLifecycle,
  canTransitionTermStatus,
  assertTermStatusTransition
} from "../../../src/terms/course-term-lifecycle.js";
import { course, term } from "../github/team-membership-fixtures.js";
import { TermCoordinators } from "../../../src/faculty/term-coordinators.js";
import { SectionFaculty } from "../../../src/faculty/section-faculty.js";
import { FallbackAdministrator } from "../../../src/faculty/fallback-administrator.js";

const withStatus = (status: TermLifecycleStatus, code = term.term.code): RawTermConfigV2 => ({
  ...structuredClone(term),
  term: { ...term.term, code, status }
});

describe("course term lifecycle snapshots", () => {
  it("classifies mixed terms, with multiple Draft and Archived terms and one Active", () => {
    const terms = [
      withStatus("draft", "28s1"),
      withStatus("archived", "26s1"),
      withStatus("active", "27s1"),
      withStatus("draft", "28s2"),
      withStatus("archived", "26s2")
    ];
    const model = new CourseTermLifecycle(terms);
    expect(model.getDraftTerms()).toEqual([terms[0], terms[3]]);
    expect(model.getArchivedTerms()).toEqual([terms[1], terms[4]]);
    expect(model.getActiveTerm()).toEqual(terms[2]);
    expect(model.requireActiveTerm()).toBe(model.getActiveTerm());
    for (const value of terms) {
      expect(model.getTerm(value.term.code)).toEqual(value);
      expect(model.getStatus(value.term.code)).toBe(value.term.status);
    }
  });

  it.each([
    [],
    ["draft"],
    ["draft", "draft"],
    ["archived", "archived"],
    ["draft", "archived"]
  ] as const)("allows zero Active terms in %j", (...statuses) => {
    const model = new CourseTermLifecycle(
      statuses.map((status, index) => withStatus(status, `27s${String(index + 1)}`))
    );
    expect(model.getActiveTerm()).toBeUndefined();
    expect(() => model.requireActiveTerm()).toThrow("requires an Active term");
    expect(model.getDraftTerms()).toHaveLength(statuses.filter((s) => s === "draft").length);
    expect(model.getArchivedTerms()).toHaveLength(statuses.filter((s) => s === "archived").length);
  });

  it("accepts a single Active-only term and returns none for unknown codes", () => {
    const active = withStatus("active");
    const model = new CourseTermLifecycle([active]);
    expect(model.requireActiveTerm()).toEqual(active);
    expect(model.getDraftTerms()).toEqual([]);
    expect(model.getArchivedTerms()).toEqual([]);
    expect(model.getTerm("missing")).toBeUndefined();
    expect(model.getStatus("missing")).toBeUndefined();
  });

  it("rejects multiple Active terms and duplicate codes regardless of status", () => {
    expect(
      () => new CourseTermLifecycle([withStatus("active", "27s1"), withStatus("active", "27s2")])
    ).toThrow("at most one Active term");
    for (const status of TERM_LIFECYCLE_STATUSES) {
      expect(() => new CourseTermLifecycle([withStatus("draft"), withStatus(status)])).toThrow(
        "Duplicate supplied term code"
      );
    }
  });

  it("validates every supplied term, including nested role metadata", () => {
    const invalidStatus = { ...term, term: { ...term.term, status: "closed" } };
    const invalidSections = { ...term, sections: [] };
    const invalidHistory = { ...term, coordinators: { current: term.coordinators.current } };
    const v1 = { ...term, schema_version: 1 };
    for (const invalid of [invalidStatus, invalidSections, invalidHistory, v1]) {
      expect(() => new CourseTermLifecycle([invalid as RawTermConfigV2])).toThrow();
    }
  });

  it("uses persisted status even for future Active and past Draft terms", () => {
    const future = {
      ...withStatus("active", "99s3"),
      term: {
        ...term.term,
        status: "active" as const,
        code: "99s3",
        academic_year: 2099,
        semester: 3 as const
      }
    };
    const past = {
      ...withStatus("draft", "01s1"),
      term: {
        ...term.term,
        status: "draft" as const,
        code: "01s1",
        academic_year: 2001
      }
    };
    const model = new CourseTermLifecycle([past, future]);
    expect(model.requireActiveTerm()).toEqual(future);
    expect(model.getDraftTerms()).toEqual([past]);
  });

  it("snapshots caller input and deeply freezes every returned term", () => {
    const inputs = TERM_LIFECYCLE_STATUSES.map((status, index) =>
      withStatus(status, `27s${String(index + 1)}`)
    );
    const before = structuredClone(inputs);
    const model = new CourseTermLifecycle(inputs);
    expect(inputs).toEqual(before);
    for (const input of inputs) {
      input.term.status = "archived";
      input.coordinators.current.splice(0);
      input.sections[0]?.faculty.former.splice(0);
    }
    inputs.splice(0);
    const returned = [
      ...model.getDraftTerms(),
      model.requireActiveTerm(),
      ...model.getArchivedTerms()
    ];
    expect(returned).toEqual(before);
    expect(Object.isFrozen(model.getDraftTerms())).toBe(true);
    expect(Object.isFrozen(model.getArchivedTerms())).toBe(true);
    const assertDeeplyFrozen = (value: unknown): void => {
      if (value !== null && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(assertDeeplyFrozen);
      }
    };
    returned.forEach(assertDeeplyFrozen);
    const active = model.requireActiveTerm();
    expect(() => Object.assign(active.term, { status: "draft" })).toThrow(TypeError);
    expect(() => Object.assign(active.coordinators.current, { length: 0 })).toThrow(TypeError);
    expect(model.getStatus(active.term.code)).toBe("active");
    expect(model.getTerm(active.term.code)).toBe(active);
  });
});

describe("normal term status transitions", () => {
  it.each([
    ["draft", "active", true],
    ["active", "archived", true],
    ["draft", "archived", false],
    ["active", "draft", false],
    ["archived", "active", false],
    ["archived", "draft", false]
  ] as const)("%s → %s allowed: %s", (from, to, allowed) => {
    expect(canTransitionTermStatus(from, to)).toBe(allowed);
    if (allowed)
      expect(() => {
        assertTermStatusTransition(from, to);
      }).not.toThrow();
    else
      expect(() => {
        assertTermStatusTransition(from, to);
      }).toThrow("Invalid normal term status transition");
  });

  it.each(TERM_LIFECYCLE_STATUSES)("treats %s → itself as a no-op", (status) => {
    expect(canTransitionTermStatus(status, status)).toBe(false);
    expect(() => {
      assertTermStatusTransition(status, status);
    }).not.toThrow();
  });
});

describe("lifecycle and role-history independence", () => {
  it.each(TERM_LIFECYCLE_STATUSES)(
    "preserves identities and coordinator invariants in %s",
    (status) => {
      const inputCourse = structuredClone(course);
      const inputTerm = withStatus(status);
      const before = structuredClone({ course: inputCourse, term: inputTerm });
      const model = new CourseTermLifecycle([inputTerm]);
      expect(model.getTerm(inputTerm.term.code)?.coordinators).toEqual(term.coordinators);
      expect(model.getTerm(inputTerm.term.code)?.sections).toEqual(term.sections);
      const roles = new TermCoordinators(inputCourse, inputTerm);
      const baseline = new TermCoordinators(course, term);
      expect(roles.getCurrentCoordinators()).toEqual(baseline.getCurrentCoordinators());
      expect(roles.getFormerCoordinators()).toEqual(baseline.getFormerCoordinators());
      for (const section of term.sections) {
        const faculty = new SectionFaculty(inputCourse, inputTerm, section.id);
        const original = new SectionFaculty(course, term, section.id);
        expect(faculty.getCurrentFaculty()).toEqual(original.getCurrentFaculty());
        expect(faculty.getFormerFaculty()).toEqual(original.getFormerFaculty());
      }
      expect(new FallbackAdministrator(inputCourse).getFacultyRecord()).toEqual(
        new FallbackAdministrator(course).getFacultyRecord()
      );
      expect({ course: inputCourse, term: inputTerm }).toEqual(before);
      expect(
        () =>
          new TermCoordinators(inputCourse, {
            ...inputTerm,
            coordinators: { current: [], former: [] }
          })
      ).toThrow("at least one current coordinator");
      const coordinatorId = term.coordinators.current[0]?.github_user_id;
      if (coordinatorId === undefined) throw new Error("Missing coordinator fixture.");
      expect(() => roles.removeCurrentCoordinator(coordinatorId)).toThrow(
        "at least one current coordinator"
      );
    }
  );
});
