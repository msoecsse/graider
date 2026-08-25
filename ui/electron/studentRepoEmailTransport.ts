import type {
  CourseSetupDiagnostic,
  StudentRepoEmailLogMessage,
  StudentRepoEmailRecipient,
  StudentRepoEmailTransportSender,
  StudentRepoEmailTransportStatusResult,
  StudentRepoEmailPreviewResult
} from "./ipc.js";
import { createStudentRepoEmailContentHash } from "./studentRepoEmailNotificationLogService.js";

export interface StudentRepoEmailSendRequest {
  readonly schemaVersion: 1;
  readonly notificationKey: string;
  readonly sender: StudentRepoEmailTransportSender;
  readonly recipient: {
    readonly studentId: string;
    readonly githubUsername: string;
    readonly email: string;
    readonly firstName: string | null;
    readonly lastName: string | null;
    readonly section: string | null;
  };
  readonly repositoryUrl: string;
  readonly assignment: {
    readonly assignmentFile: string;
    readonly assignmentSlug: string;
    readonly assignmentTitle: string;
    readonly termCode: string;
    readonly courseCode: string | null;
  };
  readonly message: {
    readonly subject: string;
    readonly bodyText: string;
  };
}

export type StudentRepoEmailSendStatus =
  | "sent"
  | "failed"
  | "skipped"
  | "already_sent"
  | "auth_required"
  | "transport_unavailable"
  | "permission_denied"
  | "invalid_request";

export interface StudentRepoEmailSendResult {
  readonly schemaVersion: 1;
  readonly notificationKey: string;
  readonly studentId: string;
  readonly email: string;
  readonly status: StudentRepoEmailSendStatus;
  readonly providerMessageId: string | null;
  readonly sentAt: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface StudentRepoEmailTransport {
  getStatus(): Promise<StudentRepoEmailTransportStatusResult>;
  sendMessage(request: StudentRepoEmailSendRequest): Promise<StudentRepoEmailSendResult>;
}

export interface StudentRepoEmailRequestBuildResult {
  readonly request: StudentRepoEmailSendRequest | null;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });

export const createStudentRepoEmailSendRequest = (
  preview: StudentRepoEmailPreviewResult,
  recipient: StudentRepoEmailRecipient,
  sender: StudentRepoEmailTransportSender
): StudentRepoEmailRequestBuildResult => {
  if (recipient.status === "already_sent") {
    return { request: null, diagnostics: [diagnostic("Repository email was already sent.")] };
  }
  if (recipient.status !== "ready") {
    return {
      request: null,
      diagnostics: [diagnostic("Recipient is not ready for repository email delivery.")]
    };
  }
  if (
    recipient.email.trim() === "" ||
    recipient.repositoryUrl === null ||
    recipient.notificationKey === null
  ) {
    return {
      request: null,
      diagnostics: [
        diagnostic("Recipient email, repository URL, and notification key are required.")
      ]
    };
  }
  if (
    recipient.subject === null ||
    recipient.body === null ||
    preview.assignmentSlug === null ||
    preview.assignmentTitle === null ||
    preview.termCode === null
  ) {
    return { request: null, diagnostics: [diagnostic("Repository email preview is incomplete.")] };
  }
  return {
    request: {
      schemaVersion: 1,
      notificationKey: recipient.notificationKey,
      sender,
      recipient: {
        studentId: recipient.studentId,
        githubUsername: recipient.githubUsername,
        email: recipient.email,
        firstName: recipient.firstName || null,
        lastName: recipient.lastName || null,
        section: recipient.section || null
      },
      repositoryUrl: recipient.repositoryUrl,
      assignment: {
        assignmentFile: preview.assignmentFile,
        assignmentSlug: preview.assignmentSlug,
        assignmentTitle: preview.assignmentTitle,
        termCode: preview.termCode,
        courseCode: preview.courseCode
      },
      message: { subject: recipient.subject, bodyText: recipient.body }
    },
    diagnostics: []
  };
};

export const redactStudentRepoEmailTransportDiagnostic = (value: string): string =>
  value
    .replace(/authorization\s*:\s*bearer\s+[^\s]+/giu, "Authorization: Bearer [redacted]")
    .replace(/bearer\s+[A-Za-z0-9._~-]+/giu, "Bearer [redacted]")
    .replace(/\b(access_token|refresh_token|client_secret)\s*[:=]\s*[^\s,;]+/giu, "$1=[redacted]")
    .replace(/\bcookie\s*:\s*[^\r\n]+/giu, "Cookie: [redacted]")
    .replace(/\b(bodyText|requestBody|messageBody)\s*[:=]\s*[^\r\n]+/giu, "$1=[redacted]");

export const toStudentRepoEmailLogMessage = (
  request: StudentRepoEmailSendRequest,
  result: StudentRepoEmailSendResult
): StudentRepoEmailLogMessage => ({
  notificationKey: request.notificationKey,
  studentId: request.recipient.studentId,
  githubUsername: request.recipient.githubUsername,
  email: request.recipient.email,
  repositoryUrl: request.repositoryUrl,
  subjectHash: createStudentRepoEmailContentHash(request.message.subject),
  bodyHash: createStudentRepoEmailContentHash(request.message.bodyText),
  status:
    result.status === "sent"
      ? "sent"
      : result.status === "skipped"
        ? "skipped"
        : result.status === "already_sent"
          ? "already_sent"
          : "failed",
  providerMessageId: result.providerMessageId,
  sentAt: result.sentAt,
  errorCode: result.errorCode,
  errorMessage:
    result.errorMessage === null
      ? null
      : redactStudentRepoEmailTransportDiagnostic(result.errorMessage)
});
