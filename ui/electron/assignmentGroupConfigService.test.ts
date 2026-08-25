import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAssignmentGroupConfig,
  saveAssignmentGroupConfig
} from "./assignmentGroupConfigService";

const assignmentFile = "terms/27s1/assignments/lab01/assignment.yml";
const createFixture = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-groups-"));
  fs.mkdirSync(path.join(root, "terms/27s1/assignments/lab01"), { recursive: true });
  fs.mkdirSync(path.join(root, "terms/27s1/rosters"), { recursive: true });
  fs.writeFileSync(
    path.join(root, assignmentFile),
    'schema_version: 1\nassignment:\n  slug: lab01\nsections:\n  - "001"\nmetadata:\n  keep: true\n',
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, "terms/27s1/rosters/section-001.csv"),
    "student_id,github_username,email,first_name,last_name,section,status\na,aa,a@example.edu,A,A,001,active\nb,bb,b@example.edu,B,B,001,active\nc,cc,c@example.edu,C,C,001,dropped\n",
    "utf8"
  );
  return root;
};

describe("assignmentGroupConfigService", () => {
  it("defaults existing assignments to individual repositories", () => {
    const root = createFixture();
    expect(
      getAssignmentGroupConfig({ courseFolderId: "course", courseFolderPath: root, assignmentFile })
    ).toMatchObject({ repositoryMode: "individual", groupsFile: "groups.csv" });
  });

  it("saves valid group CSV next to assignment.yml without changing unrelated YAML", () => {
    const root = createFixture();
    const result = saveAssignmentGroupConfig({
      courseFolderId: "course",
      courseFolderPath: root,
      assignmentFile,
      repositoryMode: "group",
      groupsCsv: "group_id,student_id\nteam-1,a\nteam-1,b\n"
    });
    expect(result.status).toBe("success");
    expect(fs.readFileSync(path.join(root, assignmentFile), "utf8")).toContain(
      "repository_mode: group"
    );
    expect(fs.readFileSync(path.join(root, assignmentFile), "utf8")).toContain("keep: true");
    expect(
      fs.readFileSync(path.join(root, "terms/27s1/assignments/lab01/groups.csv"), "utf8")
    ).toBe("group_id,student_id\nteam-1,a\nteam-1,b\n");
  });

  it("rejects duplicate memberships, inactive students, and unsafe paths", () => {
    const root = createFixture();
    const invalid = saveAssignmentGroupConfig({
      courseFolderId: "course",
      courseFolderPath: root,
      assignmentFile,
      repositoryMode: "group",
      groupsCsv: "group_id,student_id\nteam-1,a\nteam-2,a\nteam-2,c\n"
    });
    expect(invalid.status).toBe("failure");
    expect(invalid.diagnostics.map((item) => item.message).join(" ")).toMatch(
      /more than one group|cannot be assigned/u
    );
    expect(
      getAssignmentGroupConfig({
        courseFolderId: "course",
        courseFolderPath: root,
        assignmentFile: "../assignment.yml"
      }).status
    ).toBe("failure");
  });
});
