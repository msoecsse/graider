import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StudentRepoEmailPreviewRequest } from "./ipc";
import { getStudentRepoEmailPreview } from "./studentRepoEmailPreviewService";
import {
  appendStudentRepoEmailNotificationLog,
  createStudentRepoEmailContentHash,
  createStudentRepoEmailNotificationKey
} from "./studentRepoEmailNotificationLogService";

const assignmentFile = "terms/27s1/assignments/lab02/assignment.yml";

const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-email-preview-"));

const writeFixture = (root: string, roster: string, manifest: string | null): void => {
  fs.writeFileSync(
    root + "/course.yml",
    "course:\n  code: CSC1120\n  title: Data Structures\n",
    "utf8"
  );
  fs.mkdirSync(path.join(root, "terms/27s1/rosters"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "terms/27s1/term.yml"),
    'term:\n  code: 27s1\nsections:\n  - id: "001"\n',
    "utf8"
  );
  fs.writeFileSync(path.join(root, "terms/27s1/rosters/section-001.csv"), roster, "utf8");
  fs.mkdirSync(path.dirname(path.join(root, assignmentFile)), { recursive: true });
  fs.writeFileSync(
    path.join(root, assignmentFile),
    `assignment:\n  title: Lab 02\n  status: active\ntemplate:\n  repository: owner/template\n  branch: main\nsections:\n  - \"001\"\ndeadline:\n  due_at: \"2027-06-15T23:59:00-05:00\"\n  late_policy: standard\nmetadata:\n  faculty_owner: professor\n  grading_category: labs\n  points: 100\ngrading:\n  enabled: true\n`,
    "utf8"
  );
  if (manifest !== null) {
    const manifestPath = path.join(root, "terms/27s1/manifests/lab02/manifest.yml");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, manifest, "utf8");
  }
};

const request = (root: string): StudentRepoEmailPreviewRequest => ({
  courseFolderId: "course",
  courseFolderPath: root,
  assignmentFile
});

const header = "student_id,github_username,email,first_name,last_name,section,status\n";
const manifest = `repositories:
  - student_id: s001
    github_username: ada
    repository:
      name: csc1120-lab02-ada
      html_url: https://github.com/owner/csc1120-lab02-ada
`;

describe("studentRepoEmailPreviewService", () => {
  it("renders a ready recipient from the canonical roster and manifest URL without writing files", () => {
    const root = createRoot();
    writeFixture(root, `${header}s001,ada,ada@example.edu,Ada,Lovelace,001,active\n`, manifest);
    const result = getStudentRepoEmailPreview(request(root));
    expect(result.status).toBe("success");
    expect(result.summary.readyCount).toBe(1);
    expect(result.recipients[0]).toMatchObject({
      status: "ready",
      repositoryUrl: "https://github.com/owner/csc1120-lab02-ada",
      subject: "Your CSC1120 Lab 02 repository is ready"
    });
    expect(result.recipients[0]?.body).toContain("Hi Ada,");
    expect(
      fs.existsSync(path.join(root, "terms/27s1/notifications/lab02/student-repo-emails.json"))
    ).toBe(false);
  });

  it("reports missing email, missing repositories, and inactive rows without treating no repositories as blocked", () => {
    const root = createRoot();
    writeFixture(
      root,
      `${header}s001,ada,,Ada,Lovelace,001,active\ns002,ben,ben@example.edu,Ben,Bitdiddle,001,dropped\ns003,cy,cy@example.edu,Cy,Data,001,hold\ns004,dee,dee@example.edu,Dee,Example,001,active\n`,
      null
    );
    const result = getStudentRepoEmailPreview(request(root));
    expect(result.status).toBe("not_ready");
    expect(result.recipients.map((recipient) => recipient.status)).toEqual([
      "missing_email",
      "skipped",
      "skipped",
      "missing_repository"
    ]);
    expect(result.diagnostics.map((item) => item.message).join(" ")).toContain(
      "Repositories not created yet"
    );
  });

  it("reports the legacy roster schema as requiring migration", () => {
    const root = createRoot();
    writeFixture(
      root,
      "student_id,github_username,section,status\ns001,ada,001,active\n",
      manifest
    );
    const result = getStudentRepoEmailPreview(request(root));
    expect(result.recipients[0]).toMatchObject({ status: "invalid_roster" });
    expect(result.recipients[0]?.diagnostics[0]?.message).toContain(
      "canonical seven-column roster schema"
    );
  });

  it("marks a matching successful notification as already sent without writing during preview", () => {
    const root = createRoot();
    writeFixture(root, `${header}s001,ada,ada@example.edu,Ada,Lovelace,001,active\n`, manifest);
    const notificationKey = createStudentRepoEmailNotificationKey({
      assignmentFile,
      assignmentSlug: "lab02",
      studentId: "s001",
      email: "ada@example.edu",
      repositoryUrl: "https://github.com/owner/csc1120-lab02-ada"
    });
    if (notificationKey === null) throw new Error("Expected notification key.");
    appendStudentRepoEmailNotificationLog({
      courseFolderPath: root,
      assignmentFile,
      termCode: "27s1",
      assignmentSlug: "lab02",
      sender: "no-reply@example.edu",
      transport: "microsoft_graph",
      messages: [
        {
          notificationKey,
          studentId: "s001",
          githubUsername: "ada",
          email: "ada@example.edu",
          repositoryUrl: "https://github.com/owner/csc1120-lab02-ada",
          subjectHash: createStudentRepoEmailContentHash("subject"),
          bodyHash: createStudentRepoEmailContentHash("body"),
          status: "sent",
          providerMessageId: "provider-1",
          sentAt: "2027-01-15T12:05:00.000Z",
          errorCode: null,
          errorMessage: null
        }
      ]
    });
    const result = getStudentRepoEmailPreview(request(root));
    expect(result.recipients[0]).toMatchObject({
      status: "already_sent",
      sentAt: "2027-01-15T12:05:00.000Z"
    });
    expect(result.summary).toMatchObject({ readyCount: 0, alreadySentCount: 1 });
  });

  it("keeps recipients ready and reports a malformed notification log", () => {
    const root = createRoot();
    writeFixture(root, `${header}s001,ada,ada@example.edu,Ada,Lovelace,001,active\n`, manifest);
    const logPath = path.join(root, "terms/27s1/notifications/lab02/student-repo-emails.json");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, "{ malformed", "utf8");
    const result = getStudentRepoEmailPreview(request(root));
    expect(result.recipients[0]?.status).toBe("ready");
    expect(result.diagnostics.map((item) => item.message)).toContain(
      "Notification log is malformed or does not match this assignment."
    );
  });
});
