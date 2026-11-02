import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { RawTermConfigV2 } from "../../../src/config/config-models.js";
import {
  rawCourseConfigV2Schema,
  rawTermConfigV2Schema
} from "../../../src/config/config-schemas.js";
import { ArchivedTermAuthorizationResolver } from "../../../src/faculty/archived-term-authorization-resolver.js";

export const names = [
  "faculty",
  "former",
  "teaching-coordinator",
  "coordinator",
  "former-coordinator",
  "multiple",
  "fallback",
  "directory",
  "active-coordinator",
  "draft-coordinator",
  "outsider"
] as const;
export type Name = (typeof names)[number];
export const id = (name: Name) => names.indexOf(name) + 1;
export const ref = (name: Name) => ({ github_user_id: id(name) });
export const course = rawCourseConfigV2Schema.parse({
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
export const archived = rawTermConfigV2Schema.parse({
  ...rawTermConfigV2Schema.parse(
    parse(readFileSync("tests/fixtures/config/schema-v2-term.yml", "utf8"))
  ),
  term: {
    code: "26s1",
    display_name: "Completed term",
    academic_year: 2026,
    semester: 1,
    status: "archived",
    has_ever_been_active: true
  },
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
export const active: RawTermConfigV2 = {
  ...structuredClone(archived),
  term: { ...archived.term, code: "27s1", status: "active" },
  coordinators: { current: [ref("active-coordinator")], former: [] },
  sections: [{ id: "other", faculty: { current: [], former: [] } }]
};
export const draft: RawTermConfigV2 = {
  ...structuredClone(active),
  term: { ...active.term, code: "27s2", status: "draft", has_ever_been_active: false },
  coordinators: { current: [ref("draft-coordinator")], former: [] }
};
export const terms = [draft, archived, active];
export const allSections = ["001", "002", "003"];
export const resolver = (name: Name, suppliedTerms: readonly RawTermConfigV2[] = terms) =>
  new ArchivedTermAuthorizationResolver(course, suppliedTerms, archived.term.code, id(name));
