import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseConfig } from "../../../src/config/load-course-config.js";
import { loadTermConfig } from "../../../src/config/load-term-config.js";
import {
  rawCourseConfigV2Schema,
  rawTermConfigV2Schema,
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION,
  TERM_LIFECYCLE_STATUSES
} from "../../../src/config/config-schemas.js";
import {
  AuthorizationResolver,
  type AuthorizationScope
} from "../../../src/faculty/authorization-resolver.js";
import { SectionFaculty } from "../../../src/faculty/section-faculty.js";

const parsedCourse = parseCourseConfig(
  fs.readFileSync("tests/fixtures/config/schema-v2-course.yml", "utf8"),
  "course.yml"
);
const parsedTerm = loadTermConfig("tests/fixtures/config/schema-v2-term.yml");
if (parsedCourse.status !== "success" || parsedTerm.status !== "success")
  throw new Error("Invalid fixtures");
const names = [
  "faculty",
  "former",
  "teaching-coordinator",
  "coordinator",
  "former-coordinator",
  "fallback",
  "multiple",
  "directory",
  "outsider"
];
const id = (name: string) => {
  const index = names.indexOf(name);
  if (index < 0) throw new Error("Unknown test identity");
  return index + 1;
};
const ref = (name: string) => ({ github_user_id: id(name) });
const course = rawCourseConfigV2Schema.parse({
  ...parsedCourse.value,
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
const term = rawTermConfigV2Schema.parse({
  ...parsedTerm.value,
  coordinators: {
    current: [ref("teaching-coordinator"), ref("coordinator")],
    former: [ref("former-coordinator"), ref("multiple")]
  },
  sections: [
    {
      id: "001",
      faculty: {
        current: [ref("faculty"), ref("teaching-coordinator")],
        former: [ref("former"), ref("multiple")]
      }
    },
    { id: "002", faculty: { current: [ref("multiple")], former: [ref("faculty")] } },
    { id: "003", faculty: { current: [], former: [] } }
  ]
});
const resolver = (name: string) => new AuthorizationResolver(course, term, id(name));
const all = ["001", "002", "003"];

// Every row compares read and write privileges, including the unassigned section 003.
const matrix = [
  { name: "faculty", visible: ["001", "002"], mutable: ["001"], manage: false, fallback: false },
  { name: "former", visible: ["001"], mutable: [], manage: false, fallback: false },
  {
    name: "teaching-coordinator",
    visible: ["001"],
    mutable: ["001"],
    manage: true,
    fallback: false
  },
  { name: "coordinator", visible: [], mutable: [], manage: true, fallback: false },
  { name: "former-coordinator", visible: all, mutable: [], manage: false, fallback: false },
  { name: "fallback", visible: [], mutable: [], manage: false, fallback: true },
  { name: "multiple", visible: all, mutable: ["002"], manage: false, fallback: false },
  { name: "directory", visible: [], mutable: [], manage: false, fallback: false },
  { name: "outsider", visible: [], mutable: [], manage: false, fallback: false }
];

describe("v2 authorization permission matrix", () => {
  it.each(TERM_LIFECYCLE_STATUSES)("preserves all Phase 6 decisions for %s terms", (status) => {
    const capabilities = (auth: AuthorizationResolver) => ({
      facts: auth.roleFacts,
      term: auth.canViewTerm(),
      structure: auth.canManageTermStructure(),
      fallback: auth.hasFallbackAdministration(),
      scopes: (["default", "coordinator-term"] as const).map((scope) => ({
        scope: auth.getSectionScope(scope),
        sections: [...all, "unknown"].map((sectionId) => ({
          view: auth.canViewSection(sectionId, scope),
          mutate: auth.canMutateSection(sectionId, scope)
        }))
      }))
    });
    for (const name of names) {
      const auth = new AuthorizationResolver(
        course,
        { ...term, term: { ...term.term, status } },
        id(name)
      );
      expect(capabilities(auth)).toEqual(capabilities(resolver(name)));
    }
  });

  it("uses current section faculty for grading authority with no grader fact or capability", () => {
    const auth = resolver("faculty");
    expect(auth.roleFacts).toEqual({
      githubUserId: id("faculty"),
      termCode: term.term.code,
      fallbackAdministrator: false,
      currentCoordinator: false,
      formerCoordinator: false,
      currentFacultySectionIds: ["001"],
      formerFacultySectionIds: ["002"]
    });
    expect(auth.canMutateSection("001")).toEqual({
      allowed: true,
      basis: "current-section-faculty",
      effectiveScope: "section"
    });
    expect(resolver("directory").canMutateSection("001")).toEqual({
      allowed: false,
      basis: "no-authorizing-role",
      effectiveScope: "none"
    });
    expect(JSON.stringify(auth.roleFacts)).not.toMatch(/grader/iu);
    expect(Object.getOwnPropertyNames(AuthorizationResolver.prototype).join(" ")).not.toMatch(
      /grader/iu
    );
  });
  it.each(matrix)(
    "$name: default visibility and mutation",
    ({ name, visible, mutable, manage, fallback }) => {
      const auth = resolver(name);
      expect(auth.getSectionScope()).toEqual({
        visibleSectionIds: visible,
        mutableSectionIds: mutable,
        historicalReadOnlySectionIds: visible.filter((section) => !mutable.includes(section))
      });
      for (const section of all) {
        expect(auth.canViewSection(section).allowed).toBe(visible.includes(section));
        expect(auth.canMutateSection(section).allowed).toBe(mutable.includes(section));
      }
      expect(auth.canViewTerm().allowed).toBe(visible.length > 0 || manage);
      expect(auth.canManageTermStructure().allowed).toBe(manage);
      expect(auth.hasFallbackAdministration().allowed).toBe(fallback);
    }
  );

  it.each(matrix)("$name: explicit coordinator scope requires current role", ({ name, manage }) => {
    const auth = resolver(name);
    expect(auth.getSectionScope("coordinator-term")).toEqual({
      visibleSectionIds: manage ? all : [],
      mutableSectionIds: manage ? all : [],
      historicalReadOnlySectionIds: []
    });
    for (const section of all) {
      expect(auth.canViewSection(section, "coordinator-term")).toEqual(
        manage
          ? { allowed: true, basis: "current-coordinator", effectiveScope: "term" }
          : { allowed: false, basis: "current-coordinator-required", effectiveScope: "none" }
      );
      expect(auth.canMutateSection(section, "coordinator-term").allowed).toBe(manage);
    }
    // Requesting expanded scope never persists it as the default.
    expect(auth.getSectionScope()).toEqual(resolver(name).getSectionScope());
  });

  it("explains independent current/historical and recovery decisions", () => {
    const auth = resolver("multiple");
    expect(auth.roleFacts).toEqual({
      githubUserId: id("multiple"),
      termCode: term.term.code,
      fallbackAdministrator: false,
      currentCoordinator: false,
      formerCoordinator: true,
      currentFacultySectionIds: ["002"],
      formerFacultySectionIds: ["001"]
    });
    expect(auth.canViewSection("001").basis).toBe("former-section-faculty");
    expect(auth.canViewSection("003").basis).toBe("former-coordinator");
    expect(auth.canMutateSection("001")).toEqual({
      allowed: false,
      basis: "historical-read-only",
      effectiveScope: "none"
    });
    expect(auth.canMutateSection("002").basis).toBe("current-section-faculty");
    expect(resolver("fallback").hasFallbackAdministration()).toEqual({
      allowed: true,
      basis: "fallback-administrator",
      effectiveScope: "course-recovery"
    });
  });

  it("combines fallback, coordinator, and section roles without replacing any role", () => {
    const combinedCourse = { ...course, fallback_administrator: ref("teaching-coordinator") };
    const auth = new AuthorizationResolver(combinedCourse, term, id("teaching-coordinator"));
    expect(auth.roleFacts).toMatchObject({
      fallbackAdministrator: true,
      currentCoordinator: true,
      formerCoordinator: false,
      currentFacultySectionIds: ["001"],
      formerFacultySectionIds: []
    });
    expect(auth.getSectionScope().mutableSectionIds).toEqual(["001"]);
    expect(auth.getSectionScope("coordinator-term").mutableSectionIds).toEqual(all);
    expect(auth.hasFallbackAdministration().allowed).toBe(true);
  });

  it("uses only immutable numeric ID, never current/historical login or institutional username", () => {
    const renamed = {
      ...course,
      faculty_directory: course.faculty_directory.map((record) =>
        record.github_user_id === id("faculty")
          ? {
              ...record,
              github_login: String(id("outsider")),
              github_login_history: [String(id("directory"))],
              institutional_username: String(id("outsider"))
            }
          : record
      )
    };
    for (const name of ["outsider", "directory"]) {
      const auth = new AuthorizationResolver(renamed, term, id(name));
      expect(auth.canViewTerm().allowed).toBe(false);
      expect(auth.getSectionScope().visibleSectionIds).toEqual([]);
      expect(auth.canManageTermStructure().allowed).toBe(false);
    }
    for (const record of course.faculty_directory) {
      for (const key of [
        record.github_login,
        ...record.github_login_history,
        record.institutional_username,
        String(record.github_user_id)
      ]) {
        // Simulate untyped boundary misuse: even a numeric string is not an authenticated ID.
        const auth = new AuthorizationResolver(course, term, key as unknown as number);
        expect(auth.canViewTerm().allowed).toBe(false);
        expect(auth.getSectionScope().mutableSectionIds).toEqual([]);
        expect(auth.hasFallbackAdministration().allowed).toBe(false);
      }
    }
    expect(new AuthorizationResolver(renamed, term, id("faculty")).getSectionScope()).toEqual(
      resolver("faculty").getSectionScope()
    );
  });

  it("isolates terms while preserving course-level fallback identity", () => {
    const otherTerm = rawTermConfigV2Schema.parse({
      ...term,
      term: { ...term.term, code: "other" },
      coordinators: { current: [ref("directory")], former: [] },
      sections: [{ id: "001", faculty: { current: [], former: [] } }]
    });
    for (const name of [
      "teaching-coordinator",
      "former-coordinator",
      "faculty",
      "multiple",
      "fallback"
    ]) {
      const auth = new AuthorizationResolver(course, otherTerm, id(name));
      expect(auth.canViewTerm().allowed).toBe(false);
      expect(auth.getSectionScope().visibleSectionIds).toEqual([]);
      expect(auth.getSectionScope("coordinator-term").mutableSectionIds).toEqual([]);
      expect(auth.canManageTermStructure().allowed).toBe(false);
      expect(auth.hasFallbackAdministration().allowed).toBe(name === "fallback");
    }
  });

  it("keeps section transitions independent and former roles read only", () => {
    const removed = new SectionFaculty(course, term, "001").removeCurrentFaculty(id("faculty"));
    const auth = new AuthorizationResolver(course, removed, id("faculty"));
    expect(auth.getSectionScope().visibleSectionIds).toEqual(["001", "002"]);
    expect(auth.getSectionScope().mutableSectionIds).toEqual([]);
    expect(removed.sections[1]).toEqual(term.sections[1]);
    expect(resolver("faculty").getSectionScope().mutableSectionIds).toEqual(["001"]);
    const restored = new SectionFaculty(course, removed, "002").restoreFormerFaculty(id("faculty"));
    expect(
      new AuthorizationResolver(course, restored, id("faculty")).getSectionScope().mutableSectionIds
    ).toEqual(["002"]);
  });

  it("denies unknown sections and malformed runtime scope requests", () => {
    for (const name of names) {
      const auth = resolver(name);
      for (const scope of ["default", "coordinator-term"] as const) {
        expect(auth.canViewSection("missing", scope).basis).toBe("unknown-section");
        expect(auth.canMutateSection("missing", scope).allowed).toBe(false);
      }
      for (const scope of [true, "all", false] as unknown as AuthorizationScope[]) {
        expect(auth.canViewSection("001", scope).basis).toBe("invalid-scope");
        expect(auth.canMutateSection("001", scope).allowed).toBe(false);
      }
    }
  });

  it("validates all references and section identities before producing decisions", () => {
    for (const role of ["current", "former"] as const) {
      const invalidSection = {
        ...term,
        sections: [{ id: "001", faculty: { current: [], former: [], [role]: [ref("outsider")] } }]
      };
      expect(() => new AuthorizationResolver(course, invalidSection, id("fallback"))).toThrow(
        "existing faculty directory member"
      );
      const invalidCoordinator = {
        ...term,
        coordinators: { ...term.coordinators, [role]: [ref("outsider")] }
      };
      expect(() => new AuthorizationResolver(course, invalidCoordinator, id("faculty"))).toThrow(
        "existing faculty directory member"
      );
    }
    expect(
      () =>
        new AuthorizationResolver(
          course,
          { ...term, sections: [...term.sections, ...term.sections] },
          id("faculty")
        )
    ).toThrow("exactly one matching section ID");
  });

  it("snapshots inputs and freezes public facts, decisions, and section scopes", () => {
    const inputCourse = structuredClone(course);
    const inputTerm = structuredClone(term);
    const auth = new AuthorizationResolver(inputCourse, inputTerm, id("faculty"));
    inputTerm.sections.splice(0);
    inputCourse.faculty_directory.splice(0);
    expect(auth.getSectionScope().visibleSectionIds).toEqual(["001", "002"]);
    for (const value of [
      auth.roleFacts,
      auth.roleFacts.currentFacultySectionIds,
      auth.roleFacts.formerFacultySectionIds,
      auth.canViewTerm(),
      auth.canMutateSection("001"),
      auth.getSectionScope(),
      auth.getSectionScope().visibleSectionIds,
      auth.getSectionScope().mutableSectionIds,
      auth.getSectionScope().historicalReadOnlySectionIds
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });

  it("preserves both operational v1 gates", () => {
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });
});
