import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  StudentRepoEmailPreviewResult,
  StudentRepoEmailRecipient,
  StudentRepoEmailTransportSender
} from "./ipc";
import { MicrosoftGraphStudentRepoEmailTransport } from "./microsoftGraphStudentRepoEmailTransport";
import { StudentRepoEmailMockTransport } from "./studentRepoEmailMockTransport";
import {
  createStudentRepoEmailSendRequest,
  redactStudentRepoEmailTransportDiagnostic,
  toStudentRepoEmailLogMessage
} from "./studentRepoEmailTransport";

const sender: StudentRepoEmailTransportSender = {
  address: "no-reply@example.edu",
  displayName: "Graider",
  type: "shared_mailbox"
};
const preview: StudentRepoEmailPreviewResult = {
  status: "success",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  courseCode: "CSC1120",
  courseTitle: "Data Structures",
  termCode: "27s1",
  assignmentTitle: "Lab 02",
  assignmentSlug: "lab02",
  subjectTemplate: "",
  bodyTemplate: "",
  summary: {
    studentCount: 1,
    readyCount: 1,
    skippedCount: 0,
    missingEmailCount: 0,
    missingRepositoryCount: 0,
    inactiveCount: 0,
    alreadySentCount: 0
  },
  recipients: [],
  diagnostics: []
};
const recipient: StudentRepoEmailRecipient = {
  studentId: "s001",
  githubUsername: "ada",
  email: "ada@example.edu",
  firstName: "Ada",
  lastName: "Lovelace",
  section: "001",
  status: "ready",
  repositoryName: "csc1120-lab02-ada",
  repositoryUrl: "https://github.com/owner/csc1120-lab02-ada",
  subject: "Your repository is ready",
  body: "Private message body",
  notificationKey: "notification-key",
  sentAt: null,
  diagnostics: []
};

describe("student repository email transport boundary", () => {
  it("builds a transport request from a ready recipient without credentials", () => {
    const built = createStudentRepoEmailSendRequest(preview, recipient, sender);
    expect(built.diagnostics).toEqual([]);
    expect(built.request).toMatchObject({
      notificationKey: "notification-key",
      sender,
      recipient: { email: "ada@example.edu" },
      repositoryUrl: "https://github.com/owner/csc1120-lab02-ada"
    });
    expect(JSON.stringify(built.request)).not.toMatch(/token|secret|authorization/iu);
  });

  it("rejects missing recipient data and already-sent recipients before transport", () => {
    expect(
      createStudentRepoEmailSendRequest(preview, { ...recipient, email: "" }, sender).request
    ).toBeNull();
    expect(
      createStudentRepoEmailSendRequest(preview, { ...recipient, repositoryUrl: null }, sender)
        .request
    ).toBeNull();
    expect(
      createStudentRepoEmailSendRequest(preview, { ...recipient, status: "already_sent" }, sender)
        .request
    ).toBeNull();
  });

  it("uses deterministic mock outcomes and captures requests without network access", async () => {
    const request = createStudentRepoEmailSendRequest(preview, recipient, sender).request;
    if (request === null) throw new Error("Expected transport request.");
    const success = new StudentRepoEmailMockTransport("success");
    await expect(success.sendMessage(request)).resolves.toMatchObject({
      status: "sent",
      providerMessageId: "mock-notification"
    });
    expect(success.requests).toEqual([request]);
    await expect(
      new StudentRepoEmailMockTransport("failed").sendMessage(request)
    ).resolves.toMatchObject({ status: "failed" });
    await expect(
      new StudentRepoEmailMockTransport("auth_required").sendMessage(request)
    ).resolves.toMatchObject({ status: "auth_required" });
    await expect(
      new StudentRepoEmailMockTransport("permission_denied").sendMessage(request)
    ).resolves.toMatchObject({ status: "permission_denied" });
  });

  it("keeps the Graph skeleton unavailable without network or SDK imports", async () => {
    const request = createStudentRepoEmailSendRequest(preview, recipient, sender).request;
    if (request === null) throw new Error("Expected transport request.");
    const transport = new MicrosoftGraphStudentRepoEmailTransport();
    await expect(transport.getStatus()).resolves.toMatchObject({
      status: "not_configured",
      canSend: false
    });
    await expect(transport.sendMessage(request)).resolves.toMatchObject({
      status: "transport_unavailable"
    });
    const source = fs.readFileSync(
      path.join(process.cwd(), "electron", "microsoftGraphStudentRepoEmailTransport.ts"),
      "utf8"
    );
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("@microsoft");
  });

  it("redacts provider secrets and maps results to log-safe entries", () => {
    const diagnostic = redactStudentRepoEmailTransportDiagnostic(
      "Authorization: Bearer abc123 access_token=abc refresh_token=def client_secret=ghi Cookie: session=secret bodyText=Private message body"
    );
    expect(diagnostic).toContain("[redacted]");
    expect(diagnostic).not.toContain("abc123");
    expect(diagnostic).not.toContain("Private message body");
    const request = createStudentRepoEmailSendRequest(preview, recipient, sender).request;
    if (request === null) throw new Error("Expected transport request.");
    const logMessage = toStudentRepoEmailLogMessage(request, {
      schemaVersion: 1,
      notificationKey: request.notificationKey,
      studentId: "s001",
      email: "ada@example.edu",
      status: "sent",
      providerMessageId: "provider-1",
      sentAt: "2027-01-15T12:05:00.000Z",
      errorCode: null,
      errorMessage: null,
      diagnostics: []
    });
    expect(logMessage).toMatchObject({ status: "sent", providerMessageId: "provider-1" });
    expect(JSON.stringify(logMessage)).not.toContain("Private message body");
    const failedLogMessage = toStudentRepoEmailLogMessage(request, {
      schemaVersion: 1,
      notificationKey: request.notificationKey,
      studentId: "s001",
      email: "ada@example.edu",
      status: "auth_required",
      providerMessageId: null,
      sentAt: null,
      errorCode: "auth_required",
      errorMessage: "Bearer hidden-token bodyText=Private message body",
      diagnostics: []
    });
    expect(failedLogMessage).toMatchObject({ status: "failed", errorCode: "auth_required" });
    expect(failedLogMessage.errorMessage).not.toContain("hidden-token");
    expect(failedLogMessage.errorMessage).not.toContain("Private message body");
  });
});
