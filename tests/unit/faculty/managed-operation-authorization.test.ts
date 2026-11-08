import { describe, expect, it } from "vitest";
import {
  MANAGED_OPERATION_SUPPORT,
  resolveManagedReadScope
} from "../../../src/faculty/managed-operation-authorization.js";
import { archived, course, id, ref } from "./archived-authorization-fixtures.js";

const snapshot = (status: "draft" | "active" | "archived") => {
  const term = {
    ...structuredClone(archived),
    term: { ...archived.term, status, has_ever_been_active: status !== "draft" }
  };
  return {
    course: { ...course, course: { ...course.course, term_creation_order: [term.term.code] } },
    term
  };
};
describe("managed Schema 2 operation scope", () => {
  it.each(["draft", "active", "archived"] as const)(
    "%s isolates ordinary faculty, requires coordinator expansion and excludes fallback students",
    (status) => {
      const f = snapshot(status);
      const read = (name: Parameters<typeof id>[0], scope?: "coordinator-term") =>
        resolveManagedReadScope(f.course, [f.term], id(name), f.term.term.code, scope);
      expect(read("faculty").visibleSectionIds).toEqual(
        status === "draft" ? ["001"] : ["001", "002"]
      );
      expect(read("coordinator").visibleSectionIds).toEqual([]);
      expect(read("coordinator", "coordinator-term").visibleSectionIds).toEqual([
        "001",
        "002",
        "003"
      ]);
      expect(read("fallback")).toEqual({
        termVisible: true,
        commentsVisible: false,
        visibleSectionIds: []
      });
      expect(read("outsider").termVisible).toBe(false);
      expect(read("former").visibleSectionIds).toEqual(status === "draft" ? [] : ["001"]);
      expect(read("former-coordinator").visibleSectionIds).toEqual(
        status === "draft" ? [] : ["001", "002", "003"]
      );
      expect(read("former-coordinator", "coordinator-term").visibleSectionIds).toEqual([]);
    }
  );
  it("uses immutable identity through renames and snapshots returned scope", () => {
    const f = snapshot("active");
    const faculty = f.course.faculty_directory[0];
    if (!faculty) throw new Error("Missing faculty fixture.");
    faculty.github_login = "renamed";
    const result = resolveManagedReadScope(f.course, [f.term], id("faculty"), f.term.term.code);
    const section = f.term.sections[0];
    if (!section) throw new Error("Missing section fixture.");
    section.faculty.current = [ref("outsider")];
    expect(result.visibleSectionIds).toEqual(["001", "002"]);
    expect(Object.isFrozen(result.visibleSectionIds)).toBe(true);
  });
  it("rejects incomplete lifecycle/creation-order evidence", () => {
    const f = snapshot("active");
    expect(() =>
      resolveManagedReadScope(course, [f.term], id("faculty"), f.term.term.code)
    ).toThrow();
  });
  it("lists every family and preserves explicit later-phase dependencies", () => {
    const EXPECTED_OPERATION_FAMILY_COUNT = 17;
    expect(Object.keys(MANAGED_OPERATION_SUPPORT)).toHaveLength(EXPECTED_OPERATION_FAMILY_COUNT);
    expect(MANAGED_OPERATION_SUPPORT.grading).toBe("phase-14");
    expect(MANAGED_OPERATION_SUPPORT.assignment).toBe("phase-10");
    expect(MANAGED_OPERATION_SUPPORT["term-lifecycle"]).toBe("trusted-evidence-required");
  });
});
