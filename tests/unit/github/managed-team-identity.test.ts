import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION,
  rawTermConfigV2Schema
} from "../../../src/config/config-schemas.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import type { GitHubTeam } from "../../../src/github/github-models.js";
import {
  classifyManagedTeam,
  createManagedTeamIdentity,
  findDuplicateManagedTeams,
  GRAIDER_TEAM_METADATA_VERSION,
  parseManagedTeamMetadata,
  renderManagedTeamMetadata,
  type ManagedTeamIdentity
} from "../../../src/github/managed-team-identity.js";

const COURSE_ID = 1342086585;
const OTHER_COURSE_ID = 222;
const TEAM_ID = 12345;
const OTHER_TEAM_ID = 67890;
const NEGATIVE_ID = -1;
const FRACTIONAL_ID = 1.5;
const PREFIX = "graider-team:v1:";
const COURSE_KINDS = ["course-read", "course-write", "course-current-coordinators"] as const;
const TERM_KINDS = ["term-current-coordinators", "term-former-coordinators"] as const;
const SECTION_KINDS = ["section-current-faculty", "section-former-faculty"] as const;
const identities: readonly ManagedTeamIdentity[] = [
  ...COURSE_KINDS.map((kind) => ({ courseRepositoryId: COURSE_ID, kind })),
  ...TERM_KINDS.map((kind) => ({ courseRepositoryId: COURSE_ID, kind, termCode: "27s1" })),
  ...SECTION_KINDS.map((kind) => ({
    courseRepositoryId: COURSE_ID,
    kind,
    termCode: "27s1",
    sectionId: "001"
  }))
];
const sectionIdentity = createManagedTeamIdentity({
  courseRepositoryId: COURSE_ID,
  kind: "section-current-faculty",
  termCode: "27s1",
  sectionId: "001"
});
const courseIdentity = createManagedTeamIdentity({
  courseRepositoryId: COURSE_ID,
  kind: "course-write"
});
const team = (
  identity: ManagedTeamIdentity = sectionIdentity,
  overrides: Partial<GitHubTeam> = {}
): GitHubTeam => ({
  id: TEAM_ID,
  org: "course-org",
  name: "27s1-section-001-faculty",
  slug: "27s1-section-001-faculty",
  description: renderManagedTeamMetadata(identity),
  ...overrides
});

describe("managed team metadata", () => {
  it.each(identities)("round-trips $kind deterministically", (identity) => {
    const validated = createManagedTeamIdentity(identity);
    const marker = renderManagedTeamMetadata(validated);
    expect(parseManagedTeamMetadata(marker)).toEqual({
      classification: "managed",
      identity
    });
    expect(renderManagedTeamMetadata(validated)).toBe(marker);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(marker).not.toContain("course-org");
  });

  it("fixes version and field ordering independently of input property order", () => {
    expect(GRAIDER_TEAM_METADATA_VERSION).toBe(1);
    const reordered = createManagedTeamIdentity({
      sectionId: "001",
      kind: "section-current-faculty",
      termCode: "27s1",
      courseRepositoryId: COURSE_ID
    });
    expect(renderManagedTeamMetadata(reordered)).toBe(
      'graider-team:v1:{"courseRepositoryId":1342086585,"kind":"section-current-faculty","termCode":"27s1","sectionId":"001"}'
    );
  });

  it.each(["2", "999999999999999999999999999999"])(
    "keeps unsupported v%s payloads opaque",
    (version) => {
      for (const payload of ["unknown future format", JSON.stringify(courseIdentity)]) {
        const description = `graider-team:v${version}:${payload}`;
        expect(parseManagedTeamMetadata(description)).toEqual({
          classification: "unsupported_metadata_version",
          metadataVersion: version
        });
        expect(classifyManagedTeam(team(courseIdentity, { description }), COURSE_ID)).toEqual({
          classification: "unsupported_metadata_version",
          metadataVersion: version
        });
        expect(
          findDuplicateManagedTeams([team(courseIdentity, { description })], COURSE_ID)
        ).toEqual([]);
      }
    }
  );

  it.each([
    "graider-team:",
    "graider-team:v0:{}",
    "graider-team:v01:{}",
    "graider-team:v1:",
    "graider-team:v1:null",
    "graider-team:v1:[]",
    "graider-team:v1:{}",
    "graider-team:v1:{",
    `${PREFIX}${JSON.stringify({ ...courseIdentity, kind: "grader" })}`,
    `${PREFIX}${JSON.stringify({ ...courseIdentity, metadataVersion: 1 })}`,
    `${PREFIX}${JSON.stringify({ ...courseIdentity, courseRepositoryId: String(COURSE_ID) })}`,
    `${PREFIX}{"courseRepositoryId":1342086585,"courseRepositoryId":222,"kind":"course-write"}`,
    `${PREFIX}{"kind":"course-write","courseRepositoryId":1342086585}`,
    `${PREFIX}${JSON.stringify({ ...courseIdentity, termCode: "27s1" })}`,
    `${PREFIX}${JSON.stringify({ ...sectionIdentity, sectionId: "" })}`,
    `${renderManagedTeamMetadata(courseIdentity)}\n`,
    `Human prose ${renderManagedTeamMetadata(courseIdentity)}`,
    `${renderManagedTeamMetadata(courseIdentity)} extra`,
    `${renderManagedTeamMetadata(courseIdentity)}${renderManagedTeamMetadata(courseIdentity)}`
  ])("fails closed for malformed/noncanonical metadata %s", (description) => {
    expect(parseManagedTeamMetadata(description)).toEqual({ classification: "malformed_metadata" });
    expect(classifyManagedTeam(team(courseIdentity, { description }), COURSE_ID)).toEqual({
      classification: "malformed_metadata"
    });
    expect(
      findDuplicateManagedTeams(
        [
          team(courseIdentity, { description }),
          team(courseIdentity, { description, id: OTHER_TEAM_ID })
        ],
        COURSE_ID
      )
    ).toEqual([]);
  });
});

describe("managed team scope validation", () => {
  it.each(COURSE_KINDS)("rejects all extra scope for %s", (kind) => {
    for (const scope of [
      { termCode: "27s1" },
      { sectionId: "001" },
      { termCode: "27s1", sectionId: "001" },
      { termCode: undefined }
    ]) {
      expect(() =>
        createManagedTeamIdentity({ courseRepositoryId: COURSE_ID, kind, ...scope })
      ).toThrow();
    }
  });

  it.each(TERM_KINDS)("requires term and rejects section for %s", (kind) => {
    expect(() => createManagedTeamIdentity({ courseRepositoryId: COURSE_ID, kind })).toThrow();
    expect(() =>
      createManagedTeamIdentity({
        courseRepositoryId: COURSE_ID,
        kind,
        termCode: "27s1",
        sectionId: "001"
      })
    ).toThrow();
  });

  it.each(SECTION_KINDS)("requires term and section for %s", (kind) => {
    for (const scope of [{}, { termCode: "27s1" }, { sectionId: "001" }]) {
      expect(() =>
        createManagedTeamIdentity({ courseRepositoryId: COURSE_ID, kind, ...scope })
      ).toThrow();
    }
  });

  it.each([
    0,
    NEGATIVE_ID,
    FRACTIONAL_ID,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    "111",
    null,
    undefined
  ])("rejects invalid repository ID %s", (courseRepositoryId) => {
    expect(() => createManagedTeamIdentity({ ...courseIdentity, courseRepositoryId })).toThrow();
    expect(() => classifyManagedTeam(team(), courseRepositoryId as number)).toThrow();
    expect(() => findDuplicateManagedTeams([], courseRepositoryId as number)).toThrow();
    expect(
      parseManagedTeamMetadata(
        `${PREFIX}${JSON.stringify({ ...courseIdentity, courseRepositoryId })}`
      )
    ).toEqual({
      classification: "malformed_metadata"
    });
  });

  it.each(["", "27s0", "27s4", "2027s1", "27S1", "27s1\n", " 27s1", null, 1])(
    "rejects invalid term %s",
    (termCode) => {
      expect(() => createManagedTeamIdentity({ ...sectionIdentity, termCode })).toThrow();
    }
  );

  it.each(["", null, 1, undefined])("rejects invalid section %s", (sectionId) => {
    expect(() => createManagedTeamIdentity({ ...sectionIdentity, sectionId })).toThrow();
  });

  it.each(["001", "A-01", "lab / evening:二", 'quote"\\\n', "\ud800"])(
    "preserves opaque term-model section ID %s",
    (sectionId) => {
      expect(rawTermConfigV2Schema.shape.sections.element.shape.id.parse(sectionId)).toBe(
        sectionId
      );
      const identity = createManagedTeamIdentity({ ...sectionIdentity, sectionId });
      expect(parseManagedTeamMetadata(renderManagedTeamMetadata(identity))).toEqual({
        classification: "managed",
        identity
      });
    }
  );

  it("rejects unknown roles and fields without silently stripping them", () => {
    expect(() => createManagedTeamIdentity({ ...courseIdentity, kind: "faculty" })).toThrow();
    expect(() => createManagedTeamIdentity({ ...courseIdentity, org: "course-org" })).toThrow();
    expect(() =>
      renderManagedTeamMetadata({ ...courseIdentity, termCode: "27s1" } as ManagedTeamIdentity)
    ).toThrow();
  });
});

describe("observed managed teams", () => {
  it("preserves concrete numeric ID separately from logical identity across name/slug/org renames", () => {
    const original = team();
    const renamed = team(sectionIdentity, {
      org: "renamed-org",
      name: "CSC1020 Section 001 Faculty",
      slug: "csc1020-section-001-faculty"
    });
    const before = classifyManagedTeam(original, COURSE_ID);
    const after = classifyManagedTeam(renamed, COURSE_ID);
    expect(before.classification).toBe("managed_for_course");
    expect(after.classification).toBe("managed_for_course");
    if (
      before.classification !== "managed_for_course" ||
      after.classification !== "managed_for_course"
    ) {
      throw new Error("Expected recognized teams.");
    }
    expect(after.identity).toEqual(before.identity);
    expect(after.team.id).toBe(before.team.id);
    expect(after.team.id).toBe(TEAM_ID);
    expect(after.team.name).not.toBe(before.team.name);
    expect(after.team.slug).not.toBe(before.team.slug);
    expect(Object.isFrozen(after.team)).toBe(true);
    original.id = OTHER_TEAM_ID;
    expect(before.team.id).toBe(TEAM_ID);
    expect(findDuplicateManagedTeams([renamed, { ...renamed }], COURSE_ID)).toEqual([]);
  });

  it("isolates otherwise identical logical roles across canonical courses", () => {
    const other = createManagedTeamIdentity({
      ...sectionIdentity,
      courseRepositoryId: OTHER_COURSE_ID
    });
    expect(other).not.toEqual(sectionIdentity);
    expect(renderManagedTeamMetadata(other)).not.toBe(renderManagedTeamMetadata(sectionIdentity));
    expect(classifyManagedTeam(team(other), COURSE_ID)).toMatchObject({
      classification: "managed_for_other_course",
      identity: other,
      team: { id: TEAM_ID }
    });
    expect(classifyManagedTeam(team(), OTHER_COURSE_ID).classification).toBe(
      "managed_for_other_course"
    );
    expect(
      findDuplicateManagedTeams([team(), team(other, { id: OTHER_TEAM_ID })], COURSE_ID)
    ).toEqual([]);
    expect(
      findDuplicateManagedTeams([team(other), team(other, { id: OTHER_TEAM_ID })], COURSE_ID)
    ).toEqual([]);
  });

  it.each(["faculty", "graders", "27s1-section-001-faculty", "course-write"])(
    "never adopts legacy or similar-looking team %s by name",
    (name) => {
      for (const description of [
        undefined,
        null,
        "",
        "Managed by Graider",
        "A faculty team.",
        "# graider-workflow-version: 1"
      ]) {
        const observed: GitHubTeam = {
          id: TEAM_ID,
          org: "course-org",
          name,
          slug: name,
          ...(description === undefined ? {} : { description })
        };
        expect(classifyManagedTeam(observed, COURSE_ID)).toEqual({ classification: "unmanaged" });
      }
    }
  );

  it.each([
    undefined,
    0,
    NEGATIVE_ID,
    FRACTIONAL_ID,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1
  ])("requires a valid concrete remote ID: %s", (id) => {
    const observed = team();
    delete observed.id;
    if (id !== undefined) observed.id = id;
    expect(classifyManagedTeam(observed, COURSE_ID)).toEqual({
      classification: "invalid_team_resource"
    });
    expect(findDuplicateManagedTeams([observed, observed], COURSE_ID)).toEqual([]);
  });

  it("preserves description and ID through the fake read adapter without mutations", async () => {
    const observed = team();
    const client = new FakeGitHubClient({ teams: [observed] });
    const read = await client.getTeam(observed.org, observed.slug);
    expect(read).toEqual(observed);
    expect(read && classifyManagedTeam(read, COURSE_ID)).toMatchObject({
      classification: "managed_for_course",
      identity: sectionIdentity,
      team: { id: TEAM_ID }
    });
  });

  it("leaves both production schema gates at v1", () => {
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });
});

describe("duplicate logical team claims", () => {
  it("reports every distinct claiming team, without choosing a winner or changing inputs", () => {
    const observed = [
      team(),
      team(sectionIdentity, { id: OTHER_TEAM_ID, name: "Renamed", slug: "renamed" }),
      team()
    ];
    const snapshot = structuredClone(observed);
    const conflicts = findDuplicateManagedTeams(observed, COURSE_ID);
    expect(conflicts).toEqual([
      {
        status: "needs_attention",
        reason: "duplicate_managed_team_identity",
        identity: sectionIdentity,
        teams: [
          { identity: sectionIdentity, team: observed[0] },
          { identity: sectionIdentity, team: observed[1] }
        ]
      }
    ]);
    expect(observed).toEqual(snapshot);
    expect(Object.isFrozen(conflicts)).toBe(true);
  });

  it("includes all duplicates but keeps kind, term, section and course identities distinct", () => {
    const variants = [
      sectionIdentity,
      createManagedTeamIdentity({ ...sectionIdentity, kind: "section-former-faculty" }),
      createManagedTeamIdentity({ ...sectionIdentity, termCode: "27s2" }),
      createManagedTeamIdentity({ ...sectionIdentity, sectionId: "002" }),
      courseIdentity
    ];
    const distinct = variants.map((identity, index) => team(identity, { id: TEAM_ID + index }));
    expect(findDuplicateManagedTeams(distinct, COURSE_ID)).toEqual([]);
    const duplicates = variants.map((identity, index) =>
      team(identity, { id: OTHER_TEAM_ID + index })
    );
    const conflicts = findDuplicateManagedTeams([...distinct, ...duplicates], COURSE_ID);
    expect(conflicts.map((conflict) => conflict.identity)).toEqual(variants);
    expect(conflicts.every((conflict) => conflict.teams.length === 2)).toBe(true);
    expect(findDuplicateManagedTeams([], COURSE_ID)).toEqual([]);
  });
});
