import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseConfig } from "../../../src/config/load-course-config.js";
import { loadTermConfig } from "../../../src/config/load-term-config.js";
import {
  rawCourseConfigV2Schema,
  rawTermConfigV2Schema
} from "../../../src/config/config-schemas.js";
import { FallbackAdministrator } from "../../../src/faculty/fallback-administrator.js";
import { TermCoordinators } from "../../../src/faculty/term-coordinators.js";

const parsedCourse = parseCourseConfig(
  fs.readFileSync("tests/fixtures/config/schema-v2-course.yml", "utf8"),
  "course.yml"
);
const parsedTerm = loadTermConfig("tests/fixtures/config/schema-v2-term.yml");
if (
  parsedCourse.status !== "success" ||
  parsedCourse.value.schema_version !== 2 ||
  parsedTerm.status !== "success" ||
  parsedTerm.value.schema_version !== 2
)
  throw new Error("Invalid coordinator development fixtures.");
const [a, b] = parsedCourse.value.faculty_directory;
if (!a || !b) throw new Error("Expected fixture faculty A and B.");
const c = {
  institutional_username: "lee",
  github_user_id: b.github_user_id + 1,
  github_login: "lee-login",
  github_login_history: []
};
const d = {
  institutional_username: "former",
  github_user_id: c.github_user_id + 1,
  github_login: "former-login",
  github_login_history: []
};
const unknownId = d.github_user_id + 1;
const course = rawCourseConfigV2Schema.parse({
  ...parsedCourse.value,
  faculty_directory: [a, b, c, d]
});
const term = rawTermConfigV2Schema.parse({
  ...parsedTerm.value,
  sections: [{ ...parsedTerm.value.sections[0], faculty: ["jones"] }],
  coordinators: {
    current: [{ github_user_id: a.github_user_id }, { github_user_id: b.github_user_id }],
    former: [{ github_user_id: d.github_user_id }]
  }
});

describe("term coordinator identity and history", () => {
  it("resolves current and former identities from the course faculty directory", () => {
    const model = new TermCoordinators(course, term);
    expect(model.getCurrentCoordinators()).toEqual([a, b]);
    expect(model.getFormerCoordinators()).toEqual([d]);
    expect(model.isCurrentCoordinator(a.github_user_id)).toBe(true);
    expect(model.isFormerCoordinator(d.github_user_id)).toBe(true);
    expect(model.isCurrentCoordinator(d.github_user_id)).toBe(false);
    expect(model.isFormerCoordinator(a.github_user_id)).toBe(false);
    expect(model.isCurrentCoordinator(unknownId)).toBe(false);
    expect(model.isFormerCoordinator(unknownId)).toBe(false);
    expect(Object.isFrozen(model.getCurrentCoordinators())).toBe(true);
    expect(Object.isFrozen(model.getFormerCoordinators()[0]?.github_login_history)).toBe(true);
  });

  it.each(["current", "former"] as const)(
    "rejects unresolved %s identities at the domain boundary",
    (role) => {
      const value = rawTermConfigV2Schema.parse({
        ...term,
        coordinators: { ...term.coordinators, [role]: [{ github_user_id: unknownId }] }
      });
      expect(() => new TermCoordinators(course, value)).toThrow(
        "existing faculty directory member"
      );
    }
  );

  it("keeps identity through login renames and does not match display or institutional metadata", () => {
    const renamedCourse = {
      ...course,
      faculty_directory: [
        {
          ...a,
          github_login: "renamed-login",
          github_login_history: [a.github_login, String(c.github_user_id)]
        },
        b,
        c,
        d
      ]
    };
    const model = new TermCoordinators(renamedCourse, term);
    expect(model.isCurrentCoordinator(a.github_user_id)).toBe(true);
    expect(model.getCurrentCoordinators()[0]?.github_login).toBe("renamed-login");
    for (const metadata of [
      a.github_login,
      "renamed-login",
      a.institutional_username,
      d.institutional_username,
      d.github_login,
      String(c.github_user_id)
    ]) {
      expect(model.isCurrentCoordinator(Number(metadata))).toBe(false);
      expect(model.isFormerCoordinator(Number(metadata))).toBe(false);
    }
  });

  it("removes A to former history, restores A, then adds C without losing other history", () => {
    const originalCourse = structuredClone(course);
    const originalTerm = structuredClone(term);
    const model = new TermCoordinators(course, term);
    const removed = model.removeCurrentCoordinator(a.github_user_id);
    const afterRemoval = new TermCoordinators(course, removed);
    expect(afterRemoval.getCurrentCoordinators()).toEqual([b]);
    expect(afterRemoval.getFormerCoordinators()).toEqual([d, a]);
    const restored = afterRemoval.restoreFormerCoordinator(a.github_user_id);
    const afterRestore = new TermCoordinators(course, restored);
    expect(afterRestore.getCurrentCoordinators()).toEqual([b, a]);
    expect(afterRestore.getFormerCoordinators()).toEqual([d]);
    const added = afterRestore.addCurrentCoordinator(c.github_user_id);
    const afterAdd = new TermCoordinators(course, added);
    expect(afterAdd.getCurrentCoordinators()).toEqual([b, a, c]);
    expect(afterAdd.getFormerCoordinators()).toEqual([d]);
    expect(added).toEqual({
      ...originalTerm,
      coordinators: {
        current: [b, a, c].map((faculty) => ({ github_user_id: faculty.github_user_id })),
        former: originalTerm.coordinators.former
      }
    });
    expect(course).toEqual(originalCourse);
    expect(term).toEqual(originalTerm);
    expect(model.getCurrentCoordinators()).toEqual([a, b]);
    expect(rawTermConfigV2Schema.safeParse(added).success).toBe(true);
    // Returned terms and nested section faculty metadata cannot change the source or model snapshot.
    added.sections[0]?.faculty?.push("later-faculty");
    added.coordinators.former.push({ github_user_id: a.github_user_id });
    expect(term).toEqual(originalTerm);
    expect(afterRestore.addCurrentCoordinator(c.github_user_id).coordinators.former).toEqual(
      originalTerm.coordinators.former
    );
  });

  it("keeps coordinator state term-specific and separate from the fallback administrator", () => {
    const otherTerm = {
      ...term,
      term: { ...term.term, code: "27s2", semester: 2 as const },
      coordinators: { current: [{ github_user_id: b.github_user_id }], former: [] }
    };
    const otherModel = new TermCoordinators(course, otherTerm);
    expect(new FallbackAdministrator(course).isFallbackAdministrator(a.github_user_id)).toBe(true);
    expect(otherModel.isCurrentCoordinator(a.github_user_id)).toBe(false);
    expect(otherModel.isFormerCoordinator(a.github_user_id)).toBe(false);
    const nextTerm = new TermCoordinators(course, term).removeCurrentCoordinator(a.github_user_id);
    expect(otherModel.getCurrentCoordinators()).toEqual([b]);
    expect(otherTerm.coordinators.former).toEqual([]);
    expect(new FallbackAdministrator(course).getFacultyRecord()).toEqual(a);
    expect(nextTerm.term).toEqual(term.term);
    const transferredCourse = new FallbackAdministrator(course).transferTo(c.github_user_id);
    expect(new TermCoordinators(transferredCourse, term).getCurrentCoordinators()).toEqual([a, b]);
  });

  it.each([
    "addCurrentCoordinator",
    "removeCurrentCoordinator",
    "restoreFormerCoordinator"
  ] as const)("rejects unknown faculty for %s", (operation) => {
    expect(() => new TermCoordinators(course, term)[operation](unknownId)).toThrow(
      "existing faculty directory member"
    );
  });

  it("prevents duplicate or invalid transitions", () => {
    const model = new TermCoordinators(course, term);
    expect(() => model.addCurrentCoordinator(a.github_user_id)).toThrow(
      "already has coordinator history"
    );
    expect(() => model.addCurrentCoordinator(d.github_user_id)).toThrow(
      "restore former coordinators explicitly"
    );
    expect(() => model.removeCurrentCoordinator(c.github_user_id)).toThrow(
      "Only a current coordinator"
    );
    expect(() => model.restoreFormerCoordinator(a.github_user_id)).toThrow(
      "Only a former coordinator"
    );
    const removed = new TermCoordinators(course, model.removeCurrentCoordinator(a.github_user_id));
    expect(() => removed.removeCurrentCoordinator(a.github_user_id)).toThrow(
      "Only a current coordinator"
    );
    const restored = new TermCoordinators(
      course,
      removed.restoreFormerCoordinator(a.github_user_id)
    );
    expect(() => restored.restoreFormerCoordinator(a.github_user_id)).toThrow(
      "Only a former coordinator"
    );
  });

  it("enforces a current coordinator at the domain boundary and prevents removing the last one", () => {
    expect(
      () => new TermCoordinators(course, { ...term, coordinators: { current: [], former: [] } })
    ).toThrow("at least one current coordinator");
    const single = new TermCoordinators(course, {
      ...term,
      coordinators: { current: [{ github_user_id: b.github_user_id }], former: [] }
    });
    expect(() => single.removeCurrentCoordinator(b.github_user_id)).toThrow(
      "at least one current coordinator"
    );
  });

  it("snapshots caller-owned course and term inputs", () => {
    const inputCourse = structuredClone(course);
    const inputTerm = structuredClone(term);
    const model = new TermCoordinators(inputCourse, inputTerm);
    inputCourse.faculty_directory[0]?.github_login_history.push("later-login");
    inputTerm.coordinators.current.splice(0);
    expect(model.getCurrentCoordinators()).toEqual([a, b]);
    expect(model.addCurrentCoordinator(c.github_user_id).coordinators.current).toHaveLength(3);
  });
});
