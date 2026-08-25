import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendStudentRepoEmailNotificationLog,
  createStudentRepoEmailContentHash,
  createStudentRepoEmailNotificationKey,
  getStudentRepoEmailNotificationLogPath,
  getStudentRepoEmailSendHistory
} from "./studentRepoEmailNotificationLogService";

const assignmentFile = "terms/27s1/assignments/lab02/assignment.yml";
const createRoot = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), "graider notification log spaces-"));
const message = {
  notificationKey: "notification-key",
  studentId: "s001",
  githubUsername: "ada",
  email: "ada@example.edu",
  repositoryUrl: "https://github.com/owner/lab02-ada",
  subjectHash: createStudentRepoEmailContentHash("subject"),
  bodyHash: createStudentRepoEmailContentHash("body"),
  status: "sent" as const,
  providerMessageId: "provider-1",
  sentAt: "2027-01-15T12:05:00.000Z",
  errorCode: null,
  errorMessage: null
};

describe("studentRepoEmailNotificationLogService", () => {
  it("uses the assignment-scoped notification log path and reads a missing log as empty", () => {
    const root = createRoot();
    expect(getStudentRepoEmailNotificationLogPath("27s1", "lab02")).toBe(
      "terms/27s1/notifications/lab02/student-repo-emails.json"
    );
    expect(getStudentRepoEmailSendHistory(root, assignmentFile, "27s1", "lab02")).toMatchObject({
      status: "ready",
      exists: false,
      messages: []
    });
  });

  it("creates deterministic keys and changes them when the repository URL changes", () => {
    const first = createStudentRepoEmailNotificationKey({
      assignmentFile,
      assignmentSlug: "lab02",
      studentId: "s001",
      email: " ADA@example.edu ",
      repositoryUrl: "https://github.com/owner/lab02-ada"
    });
    const second = createStudentRepoEmailNotificationKey({
      assignmentFile,
      assignmentSlug: "lab02",
      studentId: "s001",
      email: "ada@example.edu",
      repositoryUrl: "https://github.com/owner/lab02-ada"
    });
    const changed = createStudentRepoEmailNotificationKey({
      assignmentFile,
      assignmentSlug: "lab02",
      studentId: "s001",
      email: "ada@example.edu",
      repositoryUrl: "https://github.com/owner/lab02-ada-v2"
    });
    expect(first).toBe(second);
    expect(changed).not.toBe(first);
    expect(
      createStudentRepoEmailNotificationKey({
        assignmentFile,
        assignmentSlug: "lab02",
        studentId: "s001",
        email: "",
        repositoryUrl: "https://github.com/owner/lab02-ada"
      })
    ).toBeNull();
  });

  it("appends without bodies, preserves messages, and rejects a duplicate successful send", () => {
    const root = createRoot();
    const request = {
      courseFolderPath: root,
      assignmentFile,
      termCode: "27s1",
      assignmentSlug: "lab02",
      sender: "no-reply@example.edu",
      transport: "microsoft_graph",
      messages: [message]
    };
    expect(
      appendStudentRepoEmailNotificationLog(request, () => "2027-01-15T12:00:00.000Z").status
    ).toBe("success");
    const history = getStudentRepoEmailSendHistory(root, assignmentFile, "27s1", "lab02");
    expect(history).toMatchObject({
      exists: true,
      sender: "no-reply@example.edu",
      updatedAt: "2027-01-15T12:00:00.000Z"
    });
    expect(history.messages).toEqual([message]);
    expect(JSON.stringify(history)).not.toContain('"body"');
    expect(appendStudentRepoEmailNotificationLog(request).status).toBe("failure");
  });

  it("does not let failed or skipped entries block later successful entries and reports malformed logs", () => {
    const root = createRoot();
    const failed = {
      ...message,
      status: "failed" as const,
      providerMessageId: null,
      sentAt: null,
      errorCode: "temporary",
      errorMessage: "retry"
    };
    const request = {
      courseFolderPath: root,
      assignmentFile,
      termCode: "27s1",
      assignmentSlug: "lab02",
      sender: "no-reply@example.edu",
      transport: "microsoft_graph",
      messages: [failed]
    };
    expect(appendStudentRepoEmailNotificationLog(request).status).toBe("success");
    expect(appendStudentRepoEmailNotificationLog({ ...request, messages: [message] }).status).toBe(
      "success"
    );
    const malformedPath = path.join(
      root,
      "terms/27s1/notifications/lab02/student-repo-emails.json"
    );
    fs.writeFileSync(malformedPath, "{ invalid", "utf8");
    expect(getStudentRepoEmailSendHistory(root, assignmentFile, "27s1", "lab02")).toMatchObject({
      status: "invalid",
      exists: true
    });
  });

  it("rejects path traversal term and assignment values", () => {
    expect(getStudentRepoEmailNotificationLogPath("../27s1", "lab02")).toBeNull();
    expect(getStudentRepoEmailNotificationLogPath("27s1", "../lab02")).toBeNull();
  });
});
