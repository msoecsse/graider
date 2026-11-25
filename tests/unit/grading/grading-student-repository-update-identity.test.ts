import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { updateGradingStudentRepository } from "../../../src/grading/grading-student-repository-update.js";

const roots: string[] = [];
const COMMIT_SHA_LENGTH = 40;
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const fixture = (version: 1 | 2 = 2) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-pull-identity-"));
  roots.push(root);
  fs.cpSync(path.resolve("tests/fixtures/roster/valid-course"), root, { recursive: true });
  const request = {
    courseRoot: root,
    termCode: "27s1",
    assignmentSlug: "lab04",
    studentId: "jones"
  };
  const manifestFile = path.join(root, "terms/27s1/manifests/lab04/manifest.yml");
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  const v2Manifest = {
    schema_version: 2,
    repository_mode: "individual",
    targets: [
      {
        target_id: "jones",
        mode: "individual",
        repository_name: "recorded-repository",
        section_ids: ["001"],
        student_ids: ["jones"],
        github_usernames: ["seanjones"],
        diagnostics: []
      }
    ],
    student_mappings: [
      {
        student_id: "jones",
        github_username: "seanjones",
        target_id: "jones",
        repository_name: "recorded-repository"
      }
    ],
    diagnostics: []
  };
  fs.writeFileSync(
    manifestFile,
    version === 2
      ? JSON.stringify(v2Manifest)
      : fs.readFileSync("tests/fixtures/manifest/valid-manifest/manifest.yml", "utf8")
  );
  const workspace = {
    resolveHead: vi.fn().mockResolvedValue("a".repeat(COMMIT_SHA_LENGTH)),
    pullUpstream: vi.fn().mockResolvedValue({ kind: "updated" }),
    readRevisionFile: vi.fn().mockResolvedValue(null),
    listTree: vi.fn().mockResolvedValue([])
  };
  return { root, request, manifestFile, v2Manifest, workspace };
};

it.each([1, 2] as const)(
  "resolves a v%s manifest through its persisted assignment mapping",
  async (version) => {
    const f = fixture(version);
    expect(await updateGradingStudentRepository(f.request, f.workspace)).toEqual({
      status: "unchanged"
    });
    expect(f.workspace.pullUpstream).toHaveBeenCalledExactlyOnceWith({
      expectedHead: "a".repeat(COMMIT_SHA_LENGTH),
      externalFastForward: {
        expectedRemote:
          version === 2
            ? "https://github.com/example-org/recorded-repository.git"
            : "https://github.com/example-org/27s1-se2030-lab04-seanjones.git"
      }
    });
  }
);

it.each([
  "missing assignment",
  "wrong assignment",
  "wrong term",
  "missing course",
  "missing student",
  "other assignment manifest",
  "blank v1 identity"
])("refuses %s before pulling or creating state", async (mode) => {
  const f = fixture(mode === "blank v1 identity" ? 1 : 2);
  const assignmentFile = path.join(f.root, "terms/27s1/assignments/lab04/assignment.yml");
  const termFile = path.join(f.root, "terms/27s1/term.yml");
  if (mode === "missing assignment") fs.unlinkSync(assignmentFile);
  if (mode === "wrong assignment")
    fs.writeFileSync(
      assignmentFile,
      fs.readFileSync(assignmentFile, "utf8").replace("slug: lab04", "slug: lab99")
    );
  if (mode === "wrong term")
    fs.writeFileSync(
      termFile,
      fs.readFileSync(termFile, "utf8").replace("code: 27s1", "code: 28s1")
    );
  if (mode === "missing course") fs.unlinkSync(path.join(f.root, "course.yml"));
  if (mode === "missing student")
    fs.writeFileSync(
      f.manifestFile,
      JSON.stringify({
        ...f.v2Manifest,
        student_mappings: []
      })
    );
  if (mode === "other assignment manifest") {
    const other = path.join(f.root, "terms/27s1/manifests/lab99/manifest.yml");
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.renameSync(f.manifestFile, other);
  }
  if (mode === "blank v1 identity")
    fs.writeFileSync(
      f.manifestFile,
      fs.readFileSync(f.manifestFile, "utf8").replace("term_code: 27s1", 'term_code: ""')
    );
  expect((await updateGradingStudentRepository(f.request, f.workspace)).status).toBe(
    "submission_changed"
  );
  expect(f.workspace.pullUpstream).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(f.root, ".graider/grading"))).toBe(false);
});

it.each(["term_code: 27s1", "assignment_slug: lab04"])(
  "retains the v1 %s identity guard",
  async (field) => {
    const f = fixture(1);
    fs.writeFileSync(
      f.manifestFile,
      fs.readFileSync(f.manifestFile, "utf8").replace(field, `${field}-other`)
    );
    expect((await updateGradingStudentRepository(f.request, f.workspace)).status).toBe(
      "submission_changed"
    );
    expect(f.workspace.pullUpstream).not.toHaveBeenCalled();
  }
);
