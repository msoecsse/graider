import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import type {
  RawAssignmentConfig,
  RawCourseConfigV1,
  RawTermConfigV1
} from "../../../src/config/config-models.js";
import type { MigrationSnapshot } from "../../../src/migration/migration-models.js";
import { createInputFingerprint } from "../../../src/config/source-fingerprint.js";
import { textHash } from "../../../src/migration/migration-evidence.js";

const SHA_LENGTH = 40;
export const SHA = "a".repeat(SHA_LENGTH);
export const ROOT_SHA = "b".repeat(SHA_LENGTH);
export const MIDDLE_SHA = "c".repeat(SHA_LENGTH);
export const BRANCH_SHA = "d".repeat(SHA_LENGTH);
export const REPOSITORY_ID = 700;
export const ORGANIZATION_ID = 800;
export const OTHER_ORGANIZATION_ID = 801;
export const USER_ID = 101;
export const OTHER_USER_ID = 102;
export const course = parse(
  fs.readFileSync("tests/fixtures/config/valid-course/course.yml", "utf8")
) as RawCourseConfigV1;
export const term: RawTermConfigV1 = {
  schema_version: 1,
  term: { code: "27s1", academic_year: 2027, semester: 1, display_name: "Spring" },
  sections: [
    { id: "001", faculty: ["jones", "smith"], roster: "rosters/001.csv" },
    { id: "002", faculty: ["jones"], roster: "rosters/002.csv" }
  ]
};
export const assignment: RawAssignmentConfig = {
  schema_version: 1,
  assignment: { slug: "lab04", title: "Lab 04", type: "individual", status: "active" },
  sections: ["001", "002"],
  metadata: { faculty_owner: "owner" },
  deadline: { due_at: "2027-04-15T23:59:00+09:00", late_policy: "standard" },
  grading: { enabled: false, mode: "no-grading" }
};
export const putTerm = (input: MigrationSnapshot, config = term, assignments = [assignment]) => {
  const root = `terms/${config.term.code}`;
  const files = Object.fromEntries(
    Object.entries(input.sourceFiles).filter(([file]) => !file.startsWith(`${root}/assignments/`))
  );
  input.sourceFiles = files;
  files[`${root}/term.yml`] = stringify(config);
  for (const section of config.sections)
    if (section.roster !== undefined)
      files[`${root}/${section.roster}`] =
        `student_id,github_username,section,status\nstudent${section.id},student-${section.id},${section.id},active\n`;
  for (const item of assignments)
    files[`${root}/assignments/${item.assignment.slug}/assignment.yml`] = stringify(item);
};
export const fixture = (): MigrationSnapshot => {
  const result: MigrationSnapshot = {
    binding: {
      repositoryId: REPOSITORY_ID,
      sourceCommitSha: SHA,
      authenticatedGithubUserId: USER_ID,
      organizationId: ORGANIZATION_ID,
      historicalOrganizationId: ORGANIZATION_ID,
      historicalRepositoryId: REPOSITORY_ID,
      repositoryName: course.course.repository,
      organizationLogin: course.github.organization
    },
    sourceFiles: { "course.yml": stringify(course) },
    runtime: { coverage: "not_applicable", files: {} },
    trustedIdentities: ["jones", "smith", "owner"].map((username, index) => ({
      institutionalUsername: username,
      githubUserId: USER_ID + index,
      githubLogin: `github-${username}`,
      provenance: "trusted-identity-evidence",
      reference: `verified:${username}`
    })),
    history: {
      sourceCommitSha: SHA,
      complete: true,
      commits: [
        { sha: ROOT_SHA, parents: [], termCodes: [] },
        { sha: SHA, parents: [ROOT_SHA], termCodes: ["27s1"] }
      ]
    }
  };
  putTerm(result);
  return result;
};
export const manifestPath = "terms/27s1/manifests/lab04/manifest.yml";
export const manifestObject = (input: MigrationSnapshot) => {
  const template = parse(
    fs.readFileSync("tests/fixtures/manifest/valid-manifest/manifest.yml", "utf8")
  ) as {
    source: { source_files: Array<{ path: string; sha256: string }>; input_fingerprint: string };
    repositories: Array<{
      student_id: string;
      github_username: string;
      section: string;
      repository: { id: number; name: string; full_name: string };
      permissions: {
        student: { username: string; pending_invite: boolean; permission: string };
        grader_team: { team_slug: string; permission: string };
      };
      lifecycle: { status: string };
    }>;
    operation_history: Array<{ command: string; status: string; completed_at?: string }>;
  };
  const base = template.repositories[0];
  if (!base) throw new Error("Missing manifest fixture.");
  template.repositories = ["001", "002"].map((section, index) => ({
    ...structuredClone(base),
    student_id: `student${section}`,
    github_username: `student-${section}`,
    section,
    repository: {
      ...base.repository,
      id: USER_ID + index,
      name: `repo-${section}`,
      full_name: `example-org/repo-${section}`
    },
    permissions: {
      ...base.permissions,
      student: { ...base.permissions.student, username: `student-${section}`, permission: "admin" }
    }
  }));
  template.source.source_files = Object.keys(input.sourceFiles)
    .filter(
      (file) =>
        file === "course.yml" ||
        file === "terms/27s1/term.yml" ||
        file.includes("/rosters/") ||
        file.endsWith("assignment.yml")
    )
    .sort()
    .map((file) => ({ path: file, sha256: textHash(input.sourceFiles[file] ?? "") }));
  template.source.input_fingerprint = createInputFingerprint(template.source.source_files);
  return template;
};
export const addManifest = (
  input: MigrationSnapshot,
  edit?: (manifest: ReturnType<typeof manifestObject>) => void
) => {
  const manifest = manifestObject(input);
  edit?.(manifest);
  (input.sourceFiles as Record<string, string>)[manifestPath] = stringify(manifest);
};
export const copyFixtureFiles = (input: MigrationSnapshot, root: string) => {
  for (const [file, content] of Object.entries(input.sourceFiles)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
};
