import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  CourseSetupDiagnostic,
  StudentRepoEmailLogMessage,
  StudentRepoEmailLogMessageStatus,
  StudentRepoEmailSendHistoryResult
} from "./ipc.js";

const SCHEMA_VERSION = 1;
const TERM_CODE_PATTERN = /^\d{2}s[123]$/u;
const ASSIGNMENT_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const ASSIGNMENT_FILE_PATTERN =
  /^terms\/(\d{2}s[123])\/assignments\/([A-Za-z0-9][A-Za-z0-9._-]*)\/assignment\.yml$/u;
const MESSAGE_STATUSES = new Set<StudentRepoEmailLogMessageStatus>([
  "sent",
  "failed",
  "skipped",
  "already_sent"
]);

interface StudentRepoEmailNotificationLog {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly assignmentFile: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly sender: string;
  readonly transport: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly StudentRepoEmailLogMessage[];
}

// Logs contain operational student data, never credentials or full message bodies.

export interface NotificationLogAppendRequest {
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly sender: string;
  readonly transport: string;
  readonly messages: readonly StudentRepoEmailLogMessage[];
}

export interface NotificationLogAppendResult {
  readonly status: "success" | "failure";
  readonly path: string;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const emptyHistory = (
  pathValue: string,
  assignmentFile: string,
  diagnostics: readonly CourseSetupDiagnostic[] = []
): StudentRepoEmailSendHistoryResult => ({
  status: diagnostics.length === 0 ? "ready" : "invalid",
  path: pathValue,
  exists: false,
  assignmentFile,
  sender: null,
  transport: null,
  createdAt: null,
  updatedAt: null,
  messages: [],
  diagnostics
});

const isContainedPath = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== "..";
};

const normalizedValue = (value: string): string => value.trim();
const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

export const createStudentRepoEmailNotificationKey = (input: {
  readonly assignmentFile: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly email: string;
  readonly repositoryUrl: string;
}): string | null => {
  const values = [
    input.assignmentFile.replaceAll("\\", "/").trim(),
    normalizedValue(input.assignmentSlug),
    normalizedValue(input.studentId),
    normalizedValue(input.email).toLowerCase(),
    normalizedValue(input.repositoryUrl)
  ];
  return values.some((value) => value.length === 0) ? null : sha256(values.join("|"));
};

export const createStudentRepoEmailContentHash = (content: string): string =>
  sha256(content.replaceAll("\r\n", "\n"));

export const getStudentRepoEmailNotificationLogPath = (
  termCode: string,
  assignmentSlug: string
): string | null =>
  TERM_CODE_PATTERN.test(termCode) && ASSIGNMENT_SLUG_PATTERN.test(assignmentSlug)
    ? `terms/${termCode}/notifications/${assignmentSlug}/student-repo-emails.json`
    : null;

const asNullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const asMessage = (value: unknown): StudentRepoEmailLogMessage | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  const required = [
    "notificationKey",
    "studentId",
    "githubUsername",
    "email",
    "repositoryUrl",
    "subjectHash",
    "bodyHash"
  ];
  if (
    required.some((key) => typeof message[key] !== "string") ||
    typeof message.status !== "string" ||
    !MESSAGE_STATUSES.has(message.status as StudentRepoEmailLogMessageStatus)
  )
    return null;
  const nullableKeys = ["providerMessageId", "sentAt", "errorCode", "errorMessage"];
  if (nullableKeys.some((key) => message[key] !== null && typeof message[key] !== "string"))
    return null;
  return {
    notificationKey: message.notificationKey as string,
    studentId: message.studentId as string,
    githubUsername: message.githubUsername as string,
    email: message.email as string,
    repositoryUrl: message.repositoryUrl as string,
    subjectHash: message.subjectHash as string,
    bodyHash: message.bodyHash as string,
    status: message.status as StudentRepoEmailLogMessageStatus,
    providerMessageId: asNullableString(message.providerMessageId),
    sentAt: asNullableString(message.sentAt),
    errorCode: asNullableString(message.errorCode),
    errorMessage: asNullableString(message.errorMessage)
  };
};

const parseLog = (content: string): StudentRepoEmailNotificationLog | null => {
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    if (
      value.schemaVersion !== SCHEMA_VERSION ||
      typeof value.assignmentFile !== "string" ||
      typeof value.termCode !== "string" ||
      typeof value.assignmentSlug !== "string" ||
      typeof value.sender !== "string" ||
      typeof value.transport !== "string" ||
      typeof value.createdAt !== "string" ||
      typeof value.updatedAt !== "string" ||
      !Array.isArray(value.messages)
    )
      return null;
    const messages = value.messages.map(asMessage);
    if (messages.some((message) => message === null)) return null;
    return {
      schemaVersion: SCHEMA_VERSION,
      assignmentFile: value.assignmentFile,
      termCode: value.termCode,
      assignmentSlug: value.assignmentSlug,
      sender: value.sender,
      transport: value.transport,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      messages: messages as StudentRepoEmailLogMessage[]
    };
  } catch {
    return null;
  }
};

export const getStudentRepoEmailSendHistory = (
  courseFolderPath: string,
  assignmentFile: string,
  termCode: string,
  assignmentSlug: string
): StudentRepoEmailSendHistoryResult => {
  const logPath = getStudentRepoEmailNotificationLogPath(termCode, assignmentSlug);
  if (logPath === null)
    return emptyHistory("", assignmentFile, [diagnostic("Notification log path is invalid.")]);
  const root = path.resolve(courseFolderPath);
  const absolutePath = path.resolve(root, logPath);
  if (!isContainedPath(root, absolutePath))
    return emptyHistory(logPath, assignmentFile, [
      diagnostic("Notification log path is outside the selected course folder.")
    ]);
  if (!fs.existsSync(absolutePath)) return emptyHistory(logPath, assignmentFile);
  try {
    const log = parseLog(fs.readFileSync(absolutePath, "utf8"));
    if (
      log === null ||
      log.assignmentFile !== assignmentFile ||
      log.termCode !== termCode ||
      log.assignmentSlug !== assignmentSlug
    )
      return {
        ...emptyHistory(logPath, assignmentFile, [
          diagnostic("Notification log is malformed or does not match this assignment.")
        ]),
        exists: true
      };
    return {
      status: "ready",
      path: logPath,
      exists: true,
      assignmentFile,
      sender: log.sender,
      transport: log.transport,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt,
      messages: log.messages,
      diagnostics: []
    };
  } catch {
    return {
      ...emptyHistory(logPath, assignmentFile, [diagnostic("Unable to read notification log.")]),
      exists: true
    };
  }
};

export const appendStudentRepoEmailNotificationLog = (
  request: NotificationLogAppendRequest,
  now: () => string = () => new Date().toISOString()
): NotificationLogAppendResult => {
  const expectedPath = getStudentRepoEmailNotificationLogPath(
    request.termCode,
    request.assignmentSlug
  );
  const assignmentMatch = request.assignmentFile
    .replaceAll("\\", "/")
    .match(ASSIGNMENT_FILE_PATTERN);
  if (
    expectedPath === null ||
    assignmentMatch === null ||
    assignmentMatch[1] !== request.termCode ||
    assignmentMatch[2] !== request.assignmentSlug
  )
    return {
      status: "failure",
      path: expectedPath ?? "",
      diagnostics: [diagnostic("Notification log request is invalid.")]
    };
  const existing = getStudentRepoEmailSendHistory(
    request.courseFolderPath,
    request.assignmentFile,
    request.termCode,
    request.assignmentSlug
  );
  if (existing.status === "invalid")
    return { status: "failure", path: existing.path, diagnostics: existing.diagnostics };
  const sentKeys = new Set(
    existing.messages
      .filter((message) => message.status === "sent")
      .map((message) => message.notificationKey)
  );
  if (
    request.messages.some(
      (message) => message.status === "sent" && sentKeys.has(message.notificationKey)
    )
  )
    return {
      status: "failure",
      path: existing.path,
      diagnostics: [diagnostic("Notification key already has a successful send.")]
    };
  const root = path.resolve(request.courseFolderPath);
  const absolutePath = path.resolve(root, existing.path);
  if (!isContainedPath(root, absolutePath))
    return {
      status: "failure",
      path: existing.path,
      diagnostics: [diagnostic("Notification log path is outside the selected course folder.")]
    };
  const timestamp = now();
  const log: StudentRepoEmailNotificationLog = {
    schemaVersion: SCHEMA_VERSION,
    assignmentFile: request.assignmentFile,
    termCode: request.termCode,
    assignmentSlug: request.assignmentSlug,
    sender: request.sender,
    transport: request.transport,
    createdAt: existing.createdAt ?? timestamp,
    updatedAt: timestamp,
    messages: [...existing.messages, ...request.messages]
  };
  try {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(log, undefined, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, absolutePath);
    return { status: "success", path: existing.path, diagnostics: [] };
  } catch {
    return {
      status: "failure",
      path: existing.path,
      diagnostics: [diagnostic("Unable to write notification log.")]
    };
  }
};
