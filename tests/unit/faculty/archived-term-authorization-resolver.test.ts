import { describe, expect, it } from "vitest";
import {
  ArchivedTermAuthorizationResolver,
  ARCHIVED_SECTION_OPERATIONS,
  ARCHIVED_STRUCTURAL_OPERATIONS,
  type ArchivedSectionOperation,
  type ArchivedStructuralOperation
} from "../../../src/faculty/archived-term-authorization-resolver.js";
import {
  AuthorizationResolver,
  type AuthorizationScope
} from "../../../src/faculty/authorization-resolver.js";
import { SectionFaculty } from "../../../src/faculty/section-faculty.js";
import { TermCoordinators } from "../../../src/faculty/term-coordinators.js";
import {
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION
} from "../../../src/config/config-schemas.js";
import {
  course,
  archived,
  active,
  draft,
  terms,
  names,
  id,
  ref,
  resolver,
  allSections,
  type Name
} from "./archived-authorization-fixtures.js";

interface MatrixRow {
  name: Name;
  metadata: boolean;
  visible: readonly string[];
  gradable: readonly string[];
  coordinator: boolean;
}
const matrix: readonly MatrixRow[] = [
  {
    name: "faculty",
    metadata: true,
    visible: ["001", "002"],
    gradable: ["001"],
    coordinator: false
  },
  { name: "former", metadata: true, visible: ["001"], gradable: [], coordinator: false },
  {
    name: "teaching-coordinator",
    metadata: true,
    visible: ["001"],
    gradable: ["001"],
    coordinator: true
  },
  { name: "coordinator", metadata: true, visible: [], gradable: [], coordinator: true },
  {
    name: "former-coordinator",
    metadata: true,
    visible: allSections,
    gradable: [],
    coordinator: false
  },
  { name: "multiple", metadata: true, visible: allSections, gradable: ["002"], coordinator: false },
  ...(
    ["fallback", "directory", "active-coordinator", "draft-coordinator", "outsider"] as const
  ).map((name) => ({
    name,
    metadata: name === "fallback",
    visible: [],
    gradable: [],
    coordinator: false
  }))
];
const lateOperations = ["grading-dispatch", "grading", "report-publication"] as const;

describe("Archived visibility and late-work matrix", () => {
  it.each(matrix)(
    "$name: historical reads and eligible current-role late work",
    ({ name, metadata, visible, gradable, coordinator }) => {
      const auth = resolver(name);
      expect(auth.canViewArchivedTerm().allowed).toBe(metadata);
      for (const scope of ["default", "coordinator-term"] as const) {
        const expectedVisible = scope === "default" ? visible : coordinator ? allSections : [];
        const expectedGradable = scope === "default" ? gradable : coordinator ? allSections : [];
        expect(auth.getArchivedSectionScope(scope)).toEqual({
          visibleSectionIds: expectedVisible,
          gradableSectionIds: expectedGradable,
          historicalReadOnlySectionIds: expectedVisible.filter(
            (section) => !expectedGradable.includes(section)
          )
        });
        for (const section of allSections) {
          expect(auth.canPerformArchivedSectionOperation("inspect", section, scope).allowed).toBe(
            expectedVisible.includes(section)
          );
          for (const operation of lateOperations)
            expect(auth.canPerformArchivedSectionOperation(operation, section, scope).allowed).toBe(
              expectedGradable.includes(section)
            );
        }
      }
      // Explicit expansion never changes the ordinary default scope.
      expect(auth.getArchivedSectionScope().visibleSectionIds).toEqual(visible);
    }
  );

  it("explains normal completion, removal, recovery, missing authority and explicit expansion", () => {
    expect(resolver("faculty").canPerformArchivedSectionOperation("grading", "001")).toEqual({
      allowed: true,
      basis: "archived-current-section-faculty",
      effectiveScope: "section",
      operation: "grading"
    });
    expect(resolver("former").canPerformArchivedSectionOperation("inspect", "001").basis).toBe(
      "archived-former-section-faculty"
    );
    expect(
      resolver("former-coordinator").canPerformArchivedSectionOperation("inspect", "003").basis
    ).toBe("archived-former-coordinator");
    expect(
      resolver("coordinator").canPerformArchivedSectionOperation(
        "grading",
        "003",
        "coordinator-term"
      ).basis
    ).toBe("archived-current-coordinator");
    for (const name of ["former", "former-coordinator"] as const) {
      expect(resolver(name).canPerformArchivedSectionOperation("grading", "001").basis).toBe(
        "historical-read-only"
      );
      expect(
        resolver(name).canPerformArchivedSectionOperation("grading", "001", "coordinator-term")
          .basis
      ).toBe("current-coordinator-required");
    }
    expect(resolver("fallback").canViewArchivedTerm()).toEqual({
      allowed: true,
      basis: "fallback-administrator",
      effectiveScope: "term-metadata"
    });
    expect(resolver("fallback").canPerformArchivedSectionOperation("grading", "001").basis).toBe(
      "no-authorizing-role"
    );
    expect(resolver("directory").canViewArchivedTerm().basis).toBe("no-authorizing-role");
    expect(resolver("multiple").canPerformArchivedSectionOperation("grading", "002").basis).toBe(
      "archived-current-section-faculty"
    );
  });

  it.each(names)("requires no Active term to retain Archived rights for %s", (name) => {
    const withoutActive = resolver(name, [archived]);
    expect(withoutActive.getArchivedSectionScope()).toEqual(
      resolver(name).getArchivedSectionScope()
    );
    expect(withoutActive.canViewArchivedTerm()).toEqual(resolver(name).canViewArchivedTerm());
  });

  it.each(["faculty", "former", "coordinator", "multiple"] as const)(
    "fallback retains only independently held %s scope",
    (name) => {
      const auth = new ArchivedTermAuthorizationResolver(
        { ...course, fallback_administrator: ref(name) },
        terms,
        archived.term.code,
        id(name)
      );
      for (const scope of ["default", "coordinator-term"] as const) {
        expect(auth.getArchivedSectionScope(scope)).toEqual(
          resolver(name).getArchivedSectionScope(scope)
        );
        for (const operation of ARCHIVED_SECTION_OPERATIONS) {
          expect(auth.canPerformArchivedSectionOperation(operation, "001", scope)).toEqual(
            resolver(name).canPerformArchivedSectionOperation(operation, "001", scope)
          );
        }
      }
      expect(auth.canPerformArchivedAdministrativeCorrection("deadline").allowed).toBe(true);
      expect(auth.roleFacts.currentCoordinator).toBe(resolver(name).roleFacts.currentCoordinator);
    }
  );

  it("validates section and runtime scope requests before granting anything", () => {
    for (const name of names) {
      const auth = resolver(name);
      for (const operation of ARCHIVED_SECTION_OPERATIONS) {
        expect(auth.canPerformArchivedSectionOperation(operation, "missing").basis).toBe(
          "unknown-section"
        );
        for (const scope of ["all", false, null] as unknown as AuthorizationScope[]) {
          expect(auth.canPerformArchivedSectionOperation(operation, "001", scope).basis).toBe(
            "invalid-scope"
          );
          expect(auth.getArchivedSectionScope(scope).visibleSectionIds).toEqual([]);
        }
      }
    }
  });

  it("uses immutable numeric identities across login renames and never accepts identity-like strings", () => {
    const renamed = {
      ...course,
      faculty_directory: course.faculty_directory.map((faculty) =>
        faculty.github_user_id === id("faculty")
          ? {
              ...faculty,
              github_login: String(id("outsider")),
              institutional_username: String(id("outsider")),
              github_login_history: [String(id("directory"))]
            }
          : faculty
      )
    };
    expect(
      new ArchivedTermAuthorizationResolver(
        renamed,
        terms,
        archived.term.code,
        id("faculty")
      ).getArchivedSectionScope()
    ).toEqual(resolver("faculty").getArchivedSectionScope());
    for (const name of ["outsider", "directory"] as const)
      expect(
        new ArchivedTermAuthorizationResolver(
          renamed,
          terms,
          archived.term.code,
          id(name)
        ).canViewArchivedTerm().allowed
      ).toBe(false);
    for (const faculty of course.faculty_directory) {
      for (const value of [
        String(faculty.github_user_id),
        faculty.github_login,
        faculty.institutional_username,
        ...faculty.github_login_history
      ]) {
        const auth = new ArchivedTermAuthorizationResolver(
          course,
          terms,
          archived.term.code,
          value as unknown as number
        );
        expect(auth.canViewArchivedTerm().allowed).toBe(false);
        expect(auth.getArchivedSectionScope().gradableSectionIds).toEqual([]);
        expect(auth.canPerformArchivedAdministrativeCorrection("faculty-assignment").allowed).toBe(
          false
        );
      }
    }
  });
});

describe("Archived lifecycle prohibitions and explicit correction", () => {
  it("freezes operation sets so runtime mutation cannot widen corrective authority", () => {
    expect(Object.isFrozen(ARCHIVED_SECTION_OPERATIONS)).toBe(true);
    expect(Object.isFrozen(ARCHIVED_STRUCTURAL_OPERATIONS)).toBe(true);
    expect(() => Object.assign(ARCHIVED_STRUCTURAL_OPERATIONS, { length: 0 })).toThrow(TypeError);
    expect(() => Object.assign(ARCHIVED_SECTION_OPERATIONS, { length: 0 })).toThrow(TypeError);
    expect(
      resolver("fallback").canPerformArchivedAdministrativeCorrection(
        "reactivate" as ArchivedStructuralOperation
      ).allowed
    ).toBe(false);
  });
  it.each(names)("always prohibits Apply and generic repository mutation for %s", (name) => {
    const auth = resolver(name);
    for (const scope of ["default", "coordinator-term"] as const) {
      expect(auth.canPerformArchivedSectionOperation("apply", "001", scope)).toEqual({
        allowed: false,
        basis: "archived-provisioning-prohibited",
        effectiveScope: "none",
        operation: "apply"
      });
      expect(
        auth.canPerformArchivedSectionOperation("student-repository-mutation", "001", scope)
      ).toEqual({
        allowed: false,
        basis: "archived-student-repository-mutation-prohibited",
        effectiveScope: "none",
        operation: "student-repository-mutation"
      });
    }
  });

  it.each(matrix)(
    "$name: ordinary structures stay frozen; corrections require separate authority",
    ({ name, coordinator }) => {
      const auth = resolver(name);
      for (const operation of ARCHIVED_STRUCTURAL_OPERATIONS) {
        expect(auth.canEditArchivedStructure(operation)).toEqual({
          allowed: false,
          basis: "archived-structure-frozen",
          effectiveScope: "none",
          operation
        });
        const correction = auth.canPerformArchivedAdministrativeCorrection(operation);
        expect(correction.allowed).toBe(coordinator || name === "fallback");
        expect(correction.basis).toBe(
          coordinator
            ? "archived-current-coordinator"
            : name === "fallback"
              ? "fallback-administrator"
              : "current-coordinator-required"
        );
        expect(correction.effectiveScope).toBe(
          coordinator ? "term" : name === "fallback" ? "course-recovery" : "none"
        );
      }
    }
  );

  it("fallback correction grants no student visibility, late work, provisioning or generic mutation", () => {
    const auth = resolver("fallback");
    for (const operation of ARCHIVED_STRUCTURAL_OPERATIONS)
      expect(auth.canPerformArchivedAdministrativeCorrection(operation).allowed).toBe(true);
    expect(auth.roleFacts).toEqual(
      new AuthorizationResolver(course, archived, id("fallback")).roleFacts
    );
    expect(auth.roleFacts.currentCoordinator).toBe(false);
    expect(auth.roleFacts.currentFacultySectionIds).toEqual([]);
    for (const operation of ARCHIVED_SECTION_OPERATIONS)
      expect(auth.canPerformArchivedSectionOperation(operation, "001").allowed).toBe(false);
  });

  it("rejects unrecognized operations, including attempts to treat reactivation/provisioning as corrections", () => {
    for (const name of ["coordinator", "fallback"] as const) {
      const auth = resolver(name);
      for (const operation of [
        "reactivate",
        "rollback",
        "delete",
        "apply",
        "grading",
        "student-repository-mutation"
      ]) {
        expect(
          auth.canPerformArchivedAdministrativeCorrection(operation as ArchivedStructuralOperation)
            .basis
        ).toBe("invalid-operation");
        expect(
          auth.canEditArchivedStructure(operation as ArchivedStructuralOperation).allowed
        ).toBe(false);
      }
      expect(
        auth.canPerformArchivedSectionOperation(
          "template-redistribution" as ArchivedSectionOperation,
          "001"
        ).basis
      ).toBe("invalid-operation");
    }
  });
});

describe("Archived context validation and role history", () => {
  it.each([active, draft])("rejects a $term.status target", (target) => {
    expect(
      () => new ArchivedTermAuthorizationResolver(course, terms, target.term.code, id("fallback"))
    ).toThrow("requires an Archived target");
  });
  it("rejects missing targets, duplicate codes, multiple Active terms and invalid history", () => {
    expect(
      () => new ArchivedTermAuthorizationResolver(course, terms, "missing", id("fallback"))
    ).toThrow("target term was not found");
    expect(() => resolver("fallback", [...terms, archived])).toThrow(
      "Duplicate supplied term code"
    );
    expect(() =>
      resolver("fallback", [...terms, { ...active, term: { ...active.term, code: "27s3" } }])
    ).toThrow("at most one Active");
    expect(() =>
      resolver("fallback", [
        { ...archived, term: { ...archived.term, has_ever_been_active: false } }
      ])
    ).toThrow();
  });
  it("validates directory references and role invariants in every supplied term", () => {
    for (const source of terms) {
      for (const invalid of [
        { ...source, coordinators: { current: [], former: [] } },
        { ...source, coordinators: { current: [ref("outsider")], former: [] } },
        {
          ...source,
          sections: [{ id: "001", faculty: { current: [], former: [ref("outsider")] } }]
        },
        { ...source, sections: [...source.sections, ...source.sections] }
      ])
        expect(() =>
          resolver(
            "fallback",
            terms.map((term) => (term === source ? invalid : term))
          )
        ).toThrow();
    }
  });
  it("uses persisted archival state rather than dates", () => {
    const future = { ...archived, term: { ...archived.term, code: "99s1", academic_year: 2099 } };
    expect(
      new ArchivedTermAuthorizationResolver(
        course,
        [future],
        future.term.code,
        id("faculty")
      ).canPerformArchivedSectionOperation("grading", "001").allowed
    ).toBe(true);
  });

  it("preserves roles on archival and distinguishes explicit removal from normal completion", () => {
    const before = structuredClone(archived);
    const normallyCompleted = resolver("faculty", [archived]);
    expect(normallyCompleted.canPerformArchivedSectionOperation("grading", "001").allowed).toBe(
      true
    );
    const removed = new SectionFaculty(course, archived, "001").removeCurrentFaculty(id("faculty"));
    const historical = new ArchivedTermAuthorizationResolver(
      course,
      [removed],
      archived.term.code,
      id("faculty")
    );
    expect(historical.canPerformArchivedSectionOperation("inspect", "001").allowed).toBe(true);
    for (const operation of lateOperations)
      expect(historical.canPerformArchivedSectionOperation(operation, "001").basis).toBe(
        "historical-read-only"
      );
    const formerCoordinator = new TermCoordinators(course, archived).removeCurrentCoordinator(
      id("coordinator")
    );
    const auth = new ArchivedTermAuthorizationResolver(
      course,
      [formerCoordinator],
      archived.term.code,
      id("coordinator")
    );
    expect(auth.getArchivedSectionScope().visibleSectionIds).toEqual(allSections);
    expect(auth.getArchivedSectionScope().gradableSectionIds).toEqual([]);
    expect(archived).toEqual(before);
    expect(normallyCompleted.roleFacts).toEqual(
      new AuthorizationResolver(course, archived, id("faculty")).roleFacts
    );
  });

  it.each(["faculty", "former-coordinator", "coordinator", "fallback"] as const)(
    "snapshots caller input and freezes all public outputs for %s",
    (name) => {
      const inputCourse = structuredClone(course);
      const inputTerms = structuredClone(terms);
      const auth = new ArchivedTermAuthorizationResolver(
        inputCourse,
        inputTerms,
        archived.term.code,
        id(name)
      );
      const outputs = () => [
        auth.roleFacts,
        auth.canViewArchivedTerm(),
        auth.getArchivedSectionScope(),
        auth.getArchivedSectionScope("coordinator-term"),
        ...ARCHIVED_SECTION_OPERATIONS.map((operation) =>
          auth.canPerformArchivedSectionOperation(operation, "001")
        ),
        ...ARCHIVED_STRUCTURAL_OPERATIONS.flatMap((operation) => [
          auth.canEditArchivedStructure(operation),
          auth.canPerformArchivedAdministrativeCorrection(operation)
        ])
      ];
      expect({ course: inputCourse, terms: inputTerms }).toEqual({ course, terms });
      const before = outputs();
      inputCourse.fallback_administrator.github_user_id = id("directory");
      inputCourse.faculty_directory.splice(0);
      for (const term of inputTerms) {
        term.coordinators.current.splice(0);
        term.sections.splice(0);
        term.term.status = "draft";
      }
      inputTerms.splice(0);
      expect(outputs()).toEqual(before);
      const frozen = (value: unknown): void => {
        if (value && typeof value === "object") {
          expect(Object.isFrozen(value)).toBe(true);
          Object.values(value).forEach(frozen);
        }
      };
      before.forEach(frozen);
      expect(() => Object.assign(auth.roleFacts, { currentCoordinator: true })).toThrow(TypeError);
      expect(outputs()).toEqual(before);
    }
  );

  it("keeps operational schema gates at one", () => {
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });
});
