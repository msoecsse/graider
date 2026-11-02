import { describe, expect, it } from "vitest";
import {
  rawTermConfigV2Schema,
  rawTermConfigV1Schema
} from "../../../src/config/config-schemas.js";
import { loadTermConfig } from "../../../src/config/load-term-config.js";
import { TermActivationAuthorizationResolver } from "../../../src/faculty/term-activation-authorization-resolver.js";
import { DraftTermAuthorizationResolver } from "../../../src/faculty/draft-term-authorization-resolver.js";
import { planTermActivation } from "../../../src/terms/term-activation.js";
import { CourseTermLifecycle } from "../../../src/terms/course-term-lifecycle.js";
import {
  course,
  terms,
  active,
  draft,
  archived,
  FALLBACK,
  COORDINATOR,
  FACULTY,
  FORMER,
  DIRECTORY_ONLY
} from "./activation-fixtures.js";

describe("explicit term activation authorization", () => {
  it.each([
    [COORDINATOR, true, "current-active-term-coordinator"],
    [FALLBACK, true, "fallback-administrator"],
    [FACULTY, false, "no-activation-authority"],
    [FORMER, false, "no-activation-authority"],
    [DIRECTORY_ONLY, false, "no-activation-authority"]
  ] as const)("actor %s allowed %s", (actor, allowed, basis) => {
    const decision = new TermActivationAuthorizationResolver(
      course,
      terms,
      draft.term.code,
      actor
    ).canActivateTerm();
    expect(decision).toEqual({ allowed, basis });
    expect(Object.isFrozen(decision)).toBe(true);
  });
  it.each([FALLBACK, COORDINATOR, FACULTY, FORMER, DIRECTORY_ONLY])(
    "only fallback performs initial activation: %s",
    (actor) => {
      expect(
        new TermActivationAuthorizationResolver(
          course,
          [draft],
          draft.term.code,
          actor
        ).canActivateTerm()
      ).toEqual({
        allowed: actor === FALLBACK,
        basis:
          actor === FALLBACK ? "fallback-administrator" : "initial-activation-fallback-required"
      });
    }
  );
  it("does not reuse Draft preparation or setup decisions", () => {
    expect(
      new DraftTermAuthorizationResolver(
        course,
        terms,
        draft.term.code,
        FACULTY
      ).canManageDraftStructure().allowed
    ).toBe(true);
    expect(() => planTermActivation(course, terms, draft.term.code, FACULTY)).toThrow(
      "no-activation-authority"
    );
    expect(
      new DraftTermAuthorizationResolver(
        course,
        terms,
        draft.term.code,
        FORMER
      ).canPrepareDraftSection("001").allowed
    ).toBe(true);
    expect(() => planTermActivation(course, terms, draft.term.code, FORMER)).toThrow(
      "no-activation-authority"
    );
  });
  it("snapshots authority and ignores dates and login-like identifiers", () => {
    const input = structuredClone(terms);
    const auth = new TermActivationAuthorizationResolver(
      course,
      input,
      draft.term.code,
      COORDINATOR
    );
    input.splice(0);
    expect(auth.canActivateTerm().allowed).toBe(true);
    expect(
      new TermActivationAuthorizationResolver(
        course,
        terms,
        draft.term.code,
        String(COORDINATOR) as unknown as number
      ).canActivateTerm().allowed
    ).toBe(false);
  });
});

describe("pure atomic activation plan", () => {
  it("isolates returned plans from later input and returned-value mutation", () => {
    const input = structuredClone(terms);
    const plan = planTermActivation(course, input, draft.term.code, FALLBACK);
    input.splice(0);
    expect(plan.before).toEqual(terms);
    expect(plan.after.find((term) => term.term.code === draft.term.code)?.term.status).toBe(
      "active"
    );
    expect(() => Object.assign(plan.after[0]?.term ?? {}, { has_ever_been_active: false })).toThrow(
      TypeError
    );
  });
  it("archives the predecessor and activates the Draft without changing any role or other term", () => {
    const before = structuredClone({ course, terms });
    const plan = planTermActivation(course, terms, draft.term.code, COORDINATOR);
    expect(plan.previousActiveTermCode).toBe(active.term.code);
    expect(plan.changedTermCodes).toEqual([active.term.code, draft.term.code]);
    const model = new CourseTermLifecycle(
      plan.after.map((term) => rawTermConfigV2Schema.parse(term))
    );
    expect(model.requireActiveTerm().term.code).toBe(draft.term.code);
    expect(model.getTerm(active.term.code)?.term).toEqual({ ...active.term, status: "archived" });
    expect(model.getTerm(draft.term.code)?.term).toEqual({
      ...draft.term,
      status: "active",
      has_ever_been_active: true
    });
    expect(model.getTerm(archived.term.code)).toEqual(archived);
    for (const old of plan.before) {
      const next = model.getTerm(old.term.code);
      expect(next?.coordinators).toEqual(old.coordinators);
      expect(next?.sections).toEqual(old.sections);
    }
    expect({ course, terms }).toEqual(before);
    const frozen = (value: unknown): void => {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(frozen);
      }
    };
    frozen(plan);
  });
  it("supports zero Active and retains irreversible evidence on recovered Drafts", () => {
    for (const history of [false, true]) {
      const target = { ...draft, term: { ...draft.term, has_ever_been_active: history } };
      const untouched = {
        ...draft,
        term: { ...draft.term, code: "28s1", has_ever_been_active: true }
      };
      const plan = planTermActivation(course, [target, untouched], target.term.code, FALLBACK);
      expect(plan.previousActiveTermCode).toBeNull();
      expect(plan.changedTermCodes).toEqual([target.term.code]);
      expect(plan.after[0]?.term).toMatchObject({ status: "active", has_ever_been_active: true });
      expect(plan.after[1]).toEqual(untouched);
    }
  });
  it.each([active.term.code, archived.term.code, "missing"])(
    "rejects non-Draft target %s",
    (code) => {
      expect(() => planTermActivation(course, terms, code, FALLBACK)).toThrow();
    }
  );
  it("rejects duplicate scopes, multiple Active, and invalid directory/role invariants anywhere", () => {
    expect(() => planTermActivation(course, [...terms, draft], draft.term.code, FALLBACK)).toThrow(
      "Duplicate supplied term code"
    );
    expect(() =>
      planTermActivation(
        course,
        [...terms, { ...active, term: { ...active.term, code: "27s3" } }],
        draft.term.code,
        FALLBACK
      )
    ).toThrow("at most one Active");
    for (const invalid of [
      { ...archived, coordinators: { current: [], former: [] } },
      {
        ...archived,
        coordinators: { current: [{ github_user_id: Number.MAX_SAFE_INTEGER }], former: [] }
      },
      { ...archived, sections: [...archived.sections, ...archived.sections] }
    ])
      expect(() =>
        planTermActivation(course, [active, draft, invalid], draft.term.code, FALLBACK)
      ).toThrow();
  });
});

describe("durable activation history schema", () => {
  it.each(["draft", "active", "archived"] as const)("validates explicit %s history", (status) => {
    expect(
      rawTermConfigV2Schema.safeParse({
        ...draft,
        term: { ...draft.term, status, has_ever_been_active: true }
      }).success
    ).toBe(true);
    expect(
      rawTermConfigV2Schema.safeParse({
        ...draft,
        term: { ...draft.term, status, has_ever_been_active: false }
      }).success
    ).toBe(status === "draft");
  });
  it.each([undefined, null, "true", 1])(
    "rejects missing/malformed activation evidence %j",
    (history) => {
      expect(
        rawTermConfigV2Schema.safeParse({
          ...draft,
          term: { ...draft.term, has_ever_been_active: history }
        }).success
      ).toBe(false);
    }
  );
  it("leaves v1 unchanged", () => {
    const result = loadTermConfig("tests/fixtures/config/valid-course/terms/27s1/term.yml");
    if (result.status !== "success") throw new Error("Invalid v1 fixture.");
    expect(rawTermConfigV1Schema.parse(result.value).term).not.toHaveProperty(
      "has_ever_been_active"
    );
    expect(
      rawTermConfigV1Schema.safeParse({
        ...result.value,
        term: { ...result.value.term, has_ever_been_active: false }
      }).success
    ).toBe(false);
  });
});
