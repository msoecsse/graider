import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseConfig } from "../../../src/config/load-course-config.js";
import { loadTermConfig } from "../../../src/config/load-term-config.js";
import {
  rawCourseConfigV2Schema,
  rawTermConfigV2Schema
} from "../../../src/config/config-schemas.js";
import { SectionFaculty } from "../../../src/faculty/section-faculty.js";
import { TermCoordinators } from "../../../src/faculty/term-coordinators.js";
import { FallbackAdministrator } from "../../../src/faculty/fallback-administrator.js";

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
  throw new Error("Invalid section faculty fixtures.");
const [a, b] = parsedCourse.value.faculty_directory;
if (!a || !b) throw new Error("Expected fixture faculty.");
const c = {
  institutional_username: "lee",
  github_user_id: b.github_user_id + 1,
  github_login: "lee-login",
  github_login_history: []
};
const d = {
  institutional_username: "new-faculty",
  github_user_id: c.github_user_id + 1,
  github_login: "new-login",
  github_login_history: []
};
const unknownId = d.github_user_id + 1;
const reference = (github_user_id: number) => ({ github_user_id });
const course = rawCourseConfigV2Schema.parse({
  ...parsedCourse.value,
  faculty_directory: [a, b, c, d]
});
const term = rawTermConfigV2Schema.parse({
  ...parsedTerm.value,
  sections: [
    {
      id: "001",
      roster: "rosters/section-001.csv",
      faculty: {
        current: [reference(a.github_user_id), reference(b.github_user_id)],
        former: [reference(c.github_user_id)]
      }
    },
    {
      id: "002",
      roster: "rosters/section-002.csv",
      faculty: { current: [reference(b.github_user_id)], former: [reference(a.github_user_id)] }
    },
    { id: "003", faculty: { current: [], former: [] } }
  ]
});

describe("section faculty identity and history", () => {
  it("resolves current/former faculty only by immutable ID", () => {
    const model = new SectionFaculty(course, term, "001");
    expect(model.getCurrentFaculty()).toEqual([a, b]);
    expect(model.getFormerFaculty()).toEqual([c]);
    expect(model.isCurrentFaculty(a.github_user_id)).toBe(true);
    expect(model.isFormerFaculty(c.github_user_id)).toBe(true);
    expect(model.isCurrentFaculty(c.github_user_id)).toBe(false);
    expect(model.isFormerFaculty(a.github_user_id)).toBe(false);
    expect(model.isCurrentFaculty(unknownId)).toBe(false);
    expect(model.isFormerFaculty(unknownId)).toBe(false);
    expect(Object.isFrozen(model.getCurrentFaculty())).toBe(true);
    expect(Object.isFrozen(model.getFormerFaculty()[0]?.github_login_history)).toBe(true);
  });

  it.each(["current", "former"] as const)(
    "rejects unknown %s references anywhere in the term",
    (role) => {
      const invalid = rawTermConfigV2Schema.parse({
        ...term,
        sections: [
          { id: "001", faculty: { current: [], former: [], [role]: [reference(unknownId)] } },
          ...term.sections.slice(1)
        ]
      });
      expect(() => new SectionFaculty(course, invalid, "001")).toThrow(
        "existing faculty directory member"
      );
      expect(() => new SectionFaculty(course, invalid, "002")).toThrow(
        "existing faculty directory member"
      );
    }
  );

  it("preserves section identity across login renames and ignores username/login/history as role keys", () => {
    const renamed = {
      ...a,
      github_login: "renamed-login",
      github_login_history: [a.github_login, String(d.github_user_id)]
    };
    const model = new SectionFaculty(
      { ...course, faculty_directory: [renamed, b, c, d] },
      term,
      "001"
    );
    expect(model.isCurrentFaculty(a.github_user_id)).toBe(true);
    expect(model.getCurrentFaculty()[0]).toEqual(renamed);
    for (const metadata of [
      a.institutional_username,
      a.github_login,
      renamed.github_login,
      c.institutional_username,
      c.github_login,
      ...renamed.github_login_history
    ]) {
      expect(model.isCurrentFaculty(Number(metadata))).toBe(false);
      expect(model.isFormerFaculty(Number(metadata))).toBe(false);
    }
  });

  it("removes A, restores A, then adds D while preserving other sections and roles", () => {
    const beforeCourse = structuredClone(course);
    const beforeTerm = structuredClone(term);
    const model = new SectionFaculty(course, term, "001");
    const removed = model.removeCurrentFaculty(a.github_user_id);
    const afterRemoval = new SectionFaculty(course, removed, "001");
    expect(afterRemoval.getCurrentFaculty()).toEqual([b]);
    expect(afterRemoval.getFormerFaculty()).toEqual([c, a]);
    const restored = afterRemoval.restoreFormerFaculty(a.github_user_id);
    const afterRestore = new SectionFaculty(course, restored, "001");
    expect(afterRestore.getCurrentFaculty()).toEqual([b, a]);
    expect(afterRestore.getFormerFaculty()).toEqual([c]);
    const added = afterRestore.addCurrentFaculty(d.github_user_id);
    const afterAdd = new SectionFaculty(course, added, "001");
    expect(afterAdd.getCurrentFaculty()).toEqual([b, a, d]);
    expect(afterAdd.getFormerFaculty()).toEqual([c]);
    for (const next of [removed, restored, added]) {
      expect(rawTermConfigV2Schema.safeParse(next).success).toBe(true);
      expect(next.sections.slice(1)).toEqual(beforeTerm.sections.slice(1));
      expect(next.coordinators).toEqual(beforeTerm.coordinators);
      expect(next.term).toEqual(beforeTerm.term);
      expect(next.sections[0]?.roster).toBe(beforeTerm.sections[0]?.roster);
    }
    expect(course).toEqual(beforeCourse);
    expect(term).toEqual(beforeTerm);
    expect(model.getCurrentFaculty()).toEqual([a, b]);
    added.sections[1]?.faculty.former.push(reference(c.github_user_id));
    added.coordinators.current.splice(0);
    expect(term).toEqual(beforeTerm);
    expect(afterRestore.addCurrentFaculty(d.github_user_id).sections.slice(1)).toEqual(
      beforeTerm.sections.slice(1)
    );
    expect(new FallbackAdministrator(course).getFacultyRecord()).toEqual(a);
  });

  it("allows B former in section 001 and current in section 002, changing each independently", () => {
    const isolated = rawTermConfigV2Schema.parse({
      ...term,
      sections: [
        {
          ...term.sections[0],
          faculty: { current: [reference(a.github_user_id)], former: [reference(b.github_user_id)] }
        },
        ...term.sections.slice(1)
      ]
    });
    const first = new SectionFaculty(course, isolated, "001");
    const second = new SectionFaculty(course, isolated, "002");
    expect(first.isFormerFaculty(b.github_user_id)).toBe(true);
    expect(second.isCurrentFaculty(b.github_user_id)).toBe(true);
    const removed = second.removeCurrentFaculty(b.github_user_id);
    expect(removed.sections[0]).toEqual(isolated.sections[0]);
    expect(new SectionFaculty(course, removed, "002").isFormerFaculty(b.github_user_id)).toBe(true);
    expect(new SectionFaculty(course, removed, "002").getCurrentFaculty()).toEqual([]);
    const restored = first.restoreFormerFaculty(b.github_user_id);
    expect(restored.sections[1]).toEqual(isolated.sections[1]);
    expect(new SectionFaculty(course, restored, "001").isCurrentFaculty(b.github_user_id)).toBe(
      true
    );
    expect(second.isCurrentFaculty(b.github_user_id)).toBe(true);
  });

  it("allows unassigned sections, including removing/restoring their last current faculty member", () => {
    const empty = new SectionFaculty(course, term, "003");
    expect(empty.getCurrentFaculty()).toEqual([]);
    expect(empty.getFormerFaculty()).toEqual([]);
    const added = empty.addCurrentFaculty(d.github_user_id);
    const removed = new SectionFaculty(course, added, "003").removeCurrentFaculty(d.github_user_id);
    expect(new SectionFaculty(course, removed, "003").getCurrentFaculty()).toEqual([]);
    expect(new SectionFaculty(course, removed, "003").getFormerFaculty()).toEqual([d]);
    const restored = new SectionFaculty(course, removed, "003").restoreFormerFaculty(
      d.github_user_id
    );
    expect(new SectionFaculty(course, restored, "003").getCurrentFaculty()).toEqual([d]);
  });

  it("does not infer section membership from coordinator/fallback authority, or coordinator authority from section membership", () => {
    const empty = new SectionFaculty(course, term, "003");
    expect(new TermCoordinators(course, term).isCurrentCoordinator(a.github_user_id)).toBe(true);
    expect(new FallbackAdministrator(course).isFallbackAdministrator(a.github_user_id)).toBe(true);
    expect(empty.isCurrentFaculty(a.github_user_id)).toBe(false);
    expect(empty.isFormerFaculty(a.github_user_id)).toBe(false);
    const added = empty.addCurrentFaculty(d.github_user_id);
    expect(new TermCoordinators(course, added).isCurrentCoordinator(d.github_user_id)).toBe(false);
    expect(new FallbackAdministrator(course).isFallbackAdministrator(d.github_user_id)).toBe(false);
    const coordinated = new TermCoordinators(course, term).addCurrentCoordinator(d.github_user_id);
    expect(new SectionFaculty(course, coordinated, "003").getCurrentFaculty()).toEqual([]);
    const transferred = new FallbackAdministrator(course).transferTo(d.github_user_id);
    expect(new SectionFaculty(transferred, term, "003").getCurrentFaculty()).toEqual([]);
  });

  it.each(["addCurrentFaculty", "removeCurrentFaculty", "restoreFormerFaculty"] as const)(
    "rejects unknown faculty for %s",
    (operation) => {
      expect(() => new SectionFaculty(course, term, "001")[operation](unknownId)).toThrow(
        "existing faculty directory member"
      );
    }
  );

  it("rejects duplicate/invalid transitions and missing/ambiguous section IDs", () => {
    const model = new SectionFaculty(course, term, "001");
    expect(() => model.addCurrentFaculty(a.github_user_id)).toThrow("already has section history");
    expect(() => model.addCurrentFaculty(c.github_user_id)).toThrow(
      "restore former faculty explicitly"
    );
    expect(() => model.removeCurrentFaculty(c.github_user_id)).toThrow(
      "Only current section faculty"
    );
    expect(() => model.restoreFormerFaculty(a.github_user_id)).toThrow(
      "Only former section faculty"
    );
    expect(() => new SectionFaculty(course, term, "missing")).toThrow(
      "exactly one matching section ID"
    );
    expect(
      () =>
        new SectionFaculty(
          course,
          { ...term, sections: [...term.sections, ...term.sections] },
          "001"
        )
    ).toThrow("exactly one matching section ID");
  });

  it("snapshots caller-owned course and term values", () => {
    const inputCourse = structuredClone(course);
    const inputTerm = structuredClone(term);
    const model = new SectionFaculty(inputCourse, inputTerm, "001");
    inputCourse.faculty_directory[0]?.github_login_history.push("later-login");
    inputTerm.sections[0]?.faculty.current.splice(0);
    expect(model.getCurrentFaculty()).toEqual([a, b]);
    expect(model.addCurrentFaculty(d.github_user_id).sections[0]?.faculty.current).toHaveLength(3);
  });
});
