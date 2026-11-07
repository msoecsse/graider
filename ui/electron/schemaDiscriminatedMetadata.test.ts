// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadMetadata } from "./remoteCourseDiscovery.js";
import {
  schemaTwoCourse,
  schemaTwoTerm,
  accessIdentity,
  metadataYaml
} from "./schemaDiscriminatedFixtures.js";

describe("schema-discriminated trusted metadata access", () => {
  const inspect = (userId = 42, status = "active") =>
    loadMetadata().inspectAccess(
      metadataYaml(schemaTwoCourse()),
      { "27s1": metadataYaml(schemaTwoTerm(status)) },
      accessIdentity(userId)
    );

  it.each(["draft", "active", "archived"])("opens %s by immutable ID", (status) => {
    expect(inspect(42, status)).toMatchObject({
      status: "valid",
      authorization: "authorized",
      terms: [{ code: "27s1", visibleSectionIds: ["001"] }]
    });
  });
  it.each(["active", "archived"])("preserves former faculty scope in %s", (status) => {
    expect(inspect(43, status)).toMatchObject({
      authorization: "authorized",
      terms: [{ visibleSectionIds: ["001"] }]
    });
    expect(inspect(45, status)).toMatchObject({
      authorization: "authorized",
      terms: [{ visibleSectionIds: ["001", "002"] }]
    });
  });
  it("does not expand current coordinators or fallback into student scope", () => {
    for (const userId of [44, 46])
      expect(inspect(userId)).toMatchObject({
        authorization: "authorized",
        terms: [{ visibleSectionIds: [] }]
      });
  });
  it("retains historical visibility without granting access to an unrelated current term", () => {
    const course = schemaTwoCourse();
    course.course.term_creation_order = ["27s1", "27s2"];
    const current = schemaTwoTerm("active", "27s2");
    current.sections[0]!.faculty = { current: [{ github_user_id: 47 }], former: [] };
    current.coordinators = { current: [{ github_user_id: 47 }], former: [] };
    const result = loadMetadata().inspectAccess(
      metadataYaml(course),
      {
        "27s1": metadataYaml(schemaTwoTerm("archived")),
        "27s2": metadataYaml(current)
      },
      accessIdentity(44)
    );
    expect(result).toMatchObject({ authorization: "authorized", terms: [{ code: "27s1" }] });
    if (result.status === "valid") expect(result.terms.map((term) => term.code)).toEqual(["27s1"]);
  });
  it("allows Active coordinators to see Draft preparation metadata through the existing overlay", () => {
    const course = schemaTwoCourse();
    course.course.term_creation_order = ["27s1", "27s2"];
    const draft = schemaTwoTerm("draft", "27s2");
    draft.coordinators = { current: [{ github_user_id: 47 }], former: [] };
    const result = loadMetadata().inspectAccess(
      metadataYaml(course),
      {
        "27s1": metadataYaml(schemaTwoTerm()),
        "27s2": metadataYaml(draft)
      },
      accessIdentity(44)
    );
    expect(result).toMatchObject({
      authorization: "authorized",
      terms: [
        { code: "27s1", visibleSectionIds: [] },
        { code: "27s2", visibleSectionIds: [] }
      ]
    });
  });
  it("permits fallback recovery metadata with no terms without granting directory-only access", () => {
    const course = schemaTwoCourse();
    course.course.term_creation_order = [];
    expect(
      loadMetadata().inspectAccess(metadataYaml(course), {}, accessIdentity(46))
    ).toMatchObject({ authorization: "authorized", terms: [] });
    expect(
      loadMetadata().inspectAccess(metadataYaml(course), {}, accessIdentity(47))
    ).toMatchObject({ authorization: "not_authorized", terms: [] });
  });
  it("does not expose Drafts through former roles or unrelated directory membership", () => {
    for (const userId of [43, 45, 47, 999])
      expect(inspect(userId, "draft")).toMatchObject({
        authorization: "not_authorized",
        terms: []
      });
  });
  it("does not infer roles from machine-local usernames or login metadata", () => {
    expect(
      loadMetadata().inspectAccess(
        metadataYaml(schemaTwoCourse()),
        { "27s1": metadataYaml(schemaTwoTerm()) },
        { ...accessIdentity(999), username: "faculty42" }
      )
    ).toMatchObject({ authorization: "not_authorized" });
  });
  it.each([{ repositoryId: 99 }, { organizationId: 99 }])(
    "rejects immutable identity mismatch %j",
    (identity) => {
      expect(
        loadMetadata().inspectAccess(
          metadataYaml(schemaTwoCourse()),
          { "27s1": metadataYaml(schemaTwoTerm()) },
          { ...accessIdentity(), ...identity }
        )
      ).toMatchObject({ status: "identity_mismatch" });
    }
  );
  it("follows organization renames under the same immutable ID", () => {
    expect(
      loadMetadata().inspectAccess(
        metadataYaml(schemaTwoCourse()),
        { "27s1": metadataYaml(schemaTwoTerm()) },
        { ...accessIdentity(), organizationLogin: "renamed" }
      )
    ).toMatchObject({ authorization: "authorized" });
  });
  it.each([null, [], [1]])(
    "refuses unavailable or parse-only operational support %j",
    (support) => {
      expect(loadMetadata().inspectCourse(metadataYaml(schemaTwoCourse()), support)).toEqual({
        status: "client_incompatible"
      });
    }
  );
  it("rejects unsupported future schemas", () => {
    expect(
      loadMetadata().inspectCourse(metadataYaml({ ...schemaTwoCourse(), schema_version: 3 }))
    ).toEqual({ status: "unsupported_schema" });
  });
  it("validates the entire lifecycle and role history before granting any access", () => {
    const course = schemaTwoCourse();
    const term = schemaTwoTerm();
    term.sections[1]!.faculty.former.push({ github_user_id: 999 });
    expect(
      loadMetadata().inspectAccess(
        metadataYaml(course),
        { "27s1": metadataYaml(term) },
        accessIdentity()
      )
    ).toMatchObject({ status: "invalid_metadata" });
    course.course.lifecycle = "archived";
    expect(
      loadMetadata().inspectAccess(
        metadataYaml(course),
        { "27s1": metadataYaml(schemaTwoTerm()) },
        accessIdentity()
      )
    ).toMatchObject({ status: "invalid_metadata" });
  });
  it("requires complete terms and authoritative identity fields", () => {
    expect(
      loadMetadata().inspectAccess(metadataYaml(schemaTwoCourse()), {}, accessIdentity())
    ).toMatchObject({ status: "invalid_metadata" });
    const course = schemaTwoCourse();
    expect(
      loadMetadata().inspectCourse(
        metadataYaml({ ...course, course: { ...course.course, repository_id: undefined } })
      )
    ).toMatchObject({ status: "invalid_metadata" });
  });
});
