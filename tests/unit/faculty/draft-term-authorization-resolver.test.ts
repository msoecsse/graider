import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { RawTermConfigV2 } from "../../../src/config/config-models.js";
import {
  rawCourseConfigV2Schema,
  rawTermConfigV2Schema,
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION
} from "../../../src/config/config-schemas.js";
import {
  DraftTermAuthorizationResolver,
  DRAFT_STUDENT_FACING_OPERATIONS
} from "../../../src/faculty/draft-term-authorization-resolver.js";
import {
  AuthorizationResolver,
  type AuthorizationScope
} from "../../../src/faculty/authorization-resolver.js";
import { buildDesiredTeamMemberships } from "../../../src/github/desired-team-membership.js";

const names = [
  "draft-coordinator",
  "teaching-coordinator",
  "faculty",
  "second-faculty",
  "former-coordinator",
  "former-faculty",
  "former-and-faculty",
  "active-coordinator",
  "active-former-coordinator",
  "active-faculty",
  "archived-coordinator",
  "other-draft-coordinator",
  "fallback",
  "directory",
  "outsider"
] as const;
type Name = (typeof names)[number];
const id = (name: Name) => names.indexOf(name) + 1;
const ref = (name: Name) => ({ github_user_id: id(name) });
const course = rawCourseConfigV2Schema.parse({
  ...rawCourseConfigV2Schema.parse(
    parse(readFileSync("tests/fixtures/config/schema-v2-course.yml", "utf8"))
  ),
  faculty_directory: names
    .filter((name) => name !== "outsider")
    .map((name) => ({
      ...ref(name),
      institutional_username: name,
      github_login: `${name}-login`,
      github_login_history: [`old-${name}`]
    })),
  fallback_administrator: ref("fallback")
});
const draft = rawTermConfigV2Schema.parse({
  ...rawTermConfigV2Schema.parse(
    parse(readFileSync("tests/fixtures/config/schema-v2-term.yml", "utf8"))
  ),
  coordinators: {
    current: [ref("draft-coordinator"), ref("teaching-coordinator")],
    former: [ref("former-coordinator"), ref("former-and-faculty"), ref("active-coordinator")]
  },
  sections: [
    {
      id: "001",
      faculty: {
        current: [ref("faculty"), ref("teaching-coordinator"), ref("former-and-faculty")],
        former: [ref("former-faculty")]
      }
    },
    { id: "002", faculty: { current: [ref("second-faculty")], former: [ref("faculty")] } },
    { id: "003", faculty: { current: [], former: [] } }
  ]
});
const active: RawTermConfigV2 = {
  ...structuredClone(draft),
  term: { ...draft.term, code: "26s3", status: "active" },
  coordinators: {
    current: [ref("active-coordinator")],
    former: [ref("active-former-coordinator")]
  },
  sections: [{ id: "active-only", faculty: { current: [ref("active-faculty")], former: [] } }]
};
const archived: RawTermConfigV2 = {
  ...structuredClone(active),
  term: { ...active.term, code: "26s1", status: "archived" },
  coordinators: { current: [ref("archived-coordinator")], former: [] }
};
const otherDraft: RawTermConfigV2 = {
  ...structuredClone(active),
  term: { ...active.term, code: "27s2", status: "draft" },
  coordinators: { current: [ref("other-draft-coordinator")], former: [] }
};
const terms = [archived, draft, otherDraft, active];
const all = ["001", "002", "003"];
const resolver = (name: Name, suppliedTerms: readonly RawTermConfigV2[] = terms) =>
  new DraftTermAuthorizationResolver(course, suppliedTerms, draft.term.code, id(name));

const matrix = [
  { name: "draft-coordinator", view: true, own: [], expanded: all, structure: true, setup: false },
  {
    name: "teaching-coordinator",
    view: true,
    own: ["001"],
    expanded: all,
    structure: true,
    setup: false
  },
  { name: "faculty", view: true, own: ["001"], expanded: [], structure: false, setup: false },
  {
    name: "second-faculty",
    view: true,
    own: ["002"],
    expanded: [],
    structure: false,
    setup: false
  },
  {
    name: "former-coordinator",
    view: false,
    own: [],
    expanded: [],
    structure: false,
    setup: false
  },
  { name: "former-faculty", view: false, own: [], expanded: [], structure: false, setup: false },
  {
    name: "former-and-faculty",
    view: true,
    own: ["001"],
    expanded: [],
    structure: false,
    setup: false
  },
  { name: "active-coordinator", view: true, own: [], expanded: all, structure: true, setup: true },
  {
    name: "active-former-coordinator",
    view: false,
    own: [],
    expanded: [],
    structure: false,
    setup: false
  },
  { name: "active-faculty", view: false, own: [], expanded: [], structure: false, setup: false },
  {
    name: "archived-coordinator",
    view: false,
    own: [],
    expanded: [],
    structure: false,
    setup: false
  },
  {
    name: "other-draft-coordinator",
    view: false,
    own: [],
    expanded: [],
    structure: false,
    setup: false
  },
  { name: "fallback", view: true, own: [], expanded: [], structure: false, setup: true },
  { name: "directory", view: false, own: [], expanded: [], structure: false, setup: false },
  { name: "outsider", view: false, own: [], expanded: [], structure: false, setup: false }
] as const;

describe("Draft authorization matrix", () => {
  it.each(matrix)(
    "$name has only its explicit Draft capabilities",
    ({ name, view, own, expanded, structure, setup }) => {
      const auth = resolver(name);
      expect(auth.canViewDraftTerm().allowed).toBe(view);
      expect(auth.canManageDraftStructure().allowed).toBe(structure);
      expect(auth.canManageDraftCoordinatorSetup().allowed).toBe(setup);
      for (const [scope, expected] of [
        ["default", own],
        ["coordinator-term", expanded]
      ] as const) {
        expect(auth.getDraftSectionScope(scope)).toEqual({
          visibleSectionIds: expected,
          preparableSectionIds: expected
        });
        for (const section of all) {
          const allowed = (expected as readonly string[]).includes(section);
          expect(auth.canViewDraftSection(section, scope).allowed).toBe(allowed);
          expect(auth.canPrepareDraftSection(section, scope).allowed).toBe(allowed);
        }
      }
    }
  );

  it("distinguishes native, cross-term, fallback, removed, and absent authority", () => {
    expect(resolver("draft-coordinator").canViewDraftTerm()).toEqual({
      allowed: true,
      basis: "draft-current-coordinator",
      effectiveScope: "term-metadata"
    });
    expect(resolver("faculty").canPrepareDraftSection("001")).toEqual({
      allowed: true,
      basis: "draft-current-section-faculty",
      effectiveScope: "section"
    });
    expect(
      resolver("active-coordinator").canPrepareDraftSection("003", "coordinator-term")
    ).toEqual({
      allowed: true,
      basis: "active-term-coordinator",
      effectiveScope: "term"
    });
    expect(resolver("fallback").canViewDraftTerm()).toEqual({
      allowed: true,
      basis: "fallback-administrator",
      effectiveScope: "term-metadata"
    });
    for (const name of [
      "former-coordinator",
      "former-faculty",
      "active-former-coordinator"
    ] as const) {
      expect(resolver(name).canViewDraftTerm().basis).toBe("former-role-not-authorized");
      expect(resolver(name).canPrepareDraftSection("001", "coordinator-term").basis).toBe(
        "former-role-not-authorized"
      );
    }
    expect(resolver("directory").canViewDraftTerm().basis).toBe("no-authorizing-role");
    expect(resolver("faculty").canPrepareDraftSection("002").basis).toBe(
      "former-role-not-authorized"
    );
    expect(resolver("faculty").canPrepareDraftSection("001", "coordinator-term").basis).toBe(
      "current-coordinator-required"
    );
  });

  it.each(names)("handles initial setup without an Active term for %s", (name) => {
    const auth = resolver(name, [draft]);
    const expected = matrix.find((row) => row.name === name);
    if (!expected) throw new Error("Missing matrix row.");
    expect(auth.canViewDraftTerm().allowed).toBe(
      name === "active-coordinator" ? false : expected.view
    );
    expect(auth.canManageDraftStructure().allowed).toBe(
      name === "active-coordinator" ? false : expected.structure
    );
    expect(auth.canManageDraftCoordinatorSetup().allowed).toBe(name === "fallback");
    expect(auth.getDraftSectionScope().preparableSectionIds).toEqual(expected.own);
    expect(auth.getDraftSectionScope("coordinator-term").preparableSectionIds).toEqual(
      name === "active-coordinator" ? [] : expected.expanded
    );
  });

  it("does not synthesize Draft roles from cross-term or fallback authority", () => {
    for (const name of ["active-coordinator", "fallback"] as const) {
      const auth = resolver(name);
      expect(auth.roleFacts).toEqual(new AuthorizationResolver(course, draft, id(name)).roleFacts);
      expect(auth.roleFacts.currentCoordinator).toBe(false);
      expect(auth.roleFacts.currentFacultySectionIds).toEqual([]);
    }
    // Active coordinator is explicitly former in the Draft, but its independent current Active role wins.
    expect(resolver("active-coordinator").roleFacts.formerCoordinator).toBe(true);
    expect(resolver("active-coordinator").canManageDraftStructure().basis).toBe(
      "active-term-coordinator"
    );
  });

  it("keeps fallback handoff/setup separate from ordinary structure and section data", () => {
    const auth = resolver("fallback", [draft]);
    expect(auth.canManageDraftCoordinatorSetup()).toEqual({
      allowed: true,
      basis: "fallback-administrator",
      effectiveScope: "course-recovery"
    });
    expect(auth.canManageDraftStructure().allowed).toBe(false);
    expect(auth.getDraftSectionScope()).toEqual({
      visibleSectionIds: [],
      preparableSectionIds: []
    });
    expect(auth.getDraftSectionScope("coordinator-term").visibleSectionIds).toEqual([]);
    expect(resolver("directory").canManageDraftCoordinatorSetup().allowed).toBe(false);
  });

  it.each(["faculty", "draft-coordinator", "teaching-coordinator"] as const)(
    "honors fallback's independent %s role",
    (name) => {
      const auth = new DraftTermAuthorizationResolver(
        { ...course, fallback_administrator: ref(name) },
        terms,
        draft.term.code,
        id(name)
      );
      expect(auth.canManageDraftCoordinatorSetup().basis).toBe("fallback-administrator");
      expect(auth.getDraftSectionScope()).toEqual(resolver(name).getDraftSectionScope());
      expect(auth.getDraftSectionScope("coordinator-term")).toEqual(
        resolver(name).getDraftSectionScope("coordinator-term")
      );
      expect(auth.canManageDraftStructure()).toEqual(resolver(name).canManageDraftStructure());
    }
  );

  it("rejects unknown sections and invalid runtime scopes even for privileged roles", () => {
    for (const name of names) {
      const auth = resolver(name);
      for (const scope of ["default", "coordinator-term"] as const) {
        expect(auth.canViewDraftSection("missing", scope).basis).toBe("unknown-section");
        expect(auth.canPrepareDraftSection("active-only", scope).basis).toBe("unknown-section");
      }
      for (const scope of ["all", true, null] as unknown as AuthorizationScope[]) {
        expect(auth.canViewDraftSection("001", scope).basis).toBe("invalid-scope");
        expect(auth.canPrepareDraftSection("001", scope).basis).toBe("invalid-scope");
        expect(auth.getDraftSectionScope(scope).visibleSectionIds).toEqual([]);
      }
    }
  });

  it("uses immutable GitHub IDs rather than numeric strings, logins or institutional metadata", () => {
    for (const name of names) {
      for (const value of [String(id(name)), name, `${name}-login`, `old-${name}`]) {
        const auth = new DraftTermAuthorizationResolver(
          course,
          terms,
          draft.term.code,
          value as unknown as number
        );
        expect(auth.canViewDraftTerm().allowed).toBe(false);
        expect(auth.canManageDraftStructure().allowed).toBe(false);
        expect(auth.canManageDraftCoordinatorSetup().allowed).toBe(false);
      }
    }
  });
});

describe("Draft student-facing prohibition", () => {
  const cases = (
    ["faculty", "draft-coordinator", "active-coordinator", "fallback"] as const
  ).flatMap((name) => DRAFT_STUDENT_FACING_OPERATIONS.map((operation) => ({ name, operation })));
  it.each(cases)("denies $operation for $name because of lifecycle", ({ name, operation }) => {
    for (const suppliedTerms of [terms, [draft]]) {
      expect(resolver(name, suppliedTerms).canPerformStudentFacingOperation(operation)).toEqual({
        allowed: false,
        basis: "draft-student-facing-operation-prohibited",
        effectiveScope: "none",
        operation
      });
    }
  });
});

describe("Draft context validation and immutability", () => {
  it.each([active, archived])("rejects a $term.status target", (target) => {
    expect(
      () => new DraftTermAuthorizationResolver(course, terms, target.term.code, id("fallback"))
    ).toThrow("requires a Draft target");
  });

  it("rejects missing targets, duplicate term codes and multiple Active terms", () => {
    expect(
      () => new DraftTermAuthorizationResolver(course, terms, "missing", id("fallback"))
    ).toThrow("target term was not found");
    expect(() => resolver("fallback", [draft, structuredClone(draft)])).toThrow(
      "Duplicate supplied term code"
    );
    expect(() =>
      resolver("fallback", [draft, active, { ...active, term: { ...active.term, code: "26s2" } }])
    ).toThrow("at most one Active");
    expect(() => resolver("fallback", [])).toThrow("target term was not found");
  });

  it("validates role references and preserves the current coordinator invariant", () => {
    for (const source of [draft, active]) {
      const invalid = { ...source, coordinators: { current: [], former: [] } };
      expect(() =>
        resolver(
          "fallback",
          terms.map((entry) => (entry === source ? invalid : entry))
        )
      ).toThrow("at least one current coordinator");
      const unknown = { ...source, coordinators: { current: [ref("outsider")], former: [] } };
      expect(() =>
        resolver(
          "fallback",
          terms.map((entry) => (entry === source ? unknown : entry))
        )
      ).toThrow("existing faculty directory member");
      const invalidFaculty = {
        ...source,
        sections: [{ id: "001", faculty: { current: [ref("outsider")], former: [] } }]
      };
      expect(() =>
        resolver(
          "fallback",
          terms.map((entry) => (entry === source ? invalidFaculty : entry))
        )
      ).toThrow("existing faculty directory member");
    }
    expect(() => resolver("fallback", [draft, { ...otherDraft, sections: [] }])).toThrow();
  });

  const capabilities = (auth: DraftTermAuthorizationResolver) => ({
    facts: auth.roleFacts,
    view: auth.canViewDraftTerm(),
    structure: auth.canManageDraftStructure(),
    setup: auth.canManageDraftCoordinatorSetup(),
    normal: auth.getDraftSectionScope(),
    expanded: auth.getDraftSectionScope("coordinator-term"),
    section: auth.canPrepareDraftSection("001"),
    student: Object.freeze(
      DRAFT_STUDENT_FACING_OPERATIONS.map((operation) =>
        auth.canPerformStudentFacingOperation(operation)
      )
    )
  });

  it.each(["faculty", "draft-coordinator", "active-coordinator", "fallback"] as const)(
    "snapshots all caller-owned inputs for %s",
    (name) => {
      const inputCourse = structuredClone(course);
      const inputTerms = structuredClone(terms);
      const auth = new DraftTermAuthorizationResolver(
        inputCourse,
        inputTerms,
        draft.term.code,
        id(name)
      );
      expect({ course: inputCourse, terms: inputTerms }).toEqual({ course, terms });
      const before = capabilities(auth);
      inputCourse.fallback_administrator.github_user_id = id("directory");
      inputCourse.faculty_directory.splice(0);
      for (const term of inputTerms) {
        term.term.status = "archived";
        term.coordinators.current.splice(0);
        term.sections.splice(0);
      }
      inputTerms.splice(0);
      expect(capabilities(auth)).toEqual(before);
      const assertFrozen = (value: unknown): void => {
        if (value !== null && typeof value === "object") {
          expect(Object.isFrozen(value)).toBe(true);
          Object.values(value).forEach(assertFrozen);
        }
      };
      Object.values(before).forEach(assertFrozen);
      expect(() => Object.assign(auth.roleFacts.currentFacultySectionIds, { length: 0 })).toThrow(
        TypeError
      );
      expect(capabilities(auth)).toEqual(before);
    }
  );

  it("leaves persisted roles, Phase 6 policy, Phase 7 desired state and operational gates unchanged", () => {
    const original = structuredClone({ course, terms });
    const repositoryId = 123;
    const desired = buildDesiredTeamMemberships(course, terms, repositoryId);
    for (const name of names) {
      capabilities(resolver(name));
      expect(new AuthorizationResolver(course, active, id(name)).roleFacts.termCode).toBe(
        active.term.code
      );
    }
    expect({ course, terms }).toEqual(original);
    expect(buildDesiredTeamMemberships(course, terms, repositoryId)).toEqual(desired);
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });
});
