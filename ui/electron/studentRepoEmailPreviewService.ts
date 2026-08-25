import fs from "node:fs";
import path from "node:path";

import { parseDocument } from "yaml";
import { getAssignmentForEdit } from "./assignmentEditService.js";
import {
  createStudentRepoEmailNotificationKey,
  getStudentRepoEmailSendHistory
} from "./studentRepoEmailNotificationLogService.js";
import { getRosterForSection } from "./rosterManagerService.js";
import type {
  CourseSetupDiagnostic,
  StudentRepoEmailPreviewRequest,
  StudentRepoEmailPreviewResult,
  StudentRepoEmailRecipient,
  StudentRepoEmailPreviewSummary
} from "./ipc.js";

const SUBJECT_TEMPLATE = "Your {course_code} {assignment_title} repository is ready";
const BODY_TEMPLATE = `Hi {first_name},

Your repository for {assignment_title} is ready:

{repository_url}

Please use this repository for your work.

Course: {course_code}
Assignment: {assignment_title}
`;

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });

interface ManifestRepository {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly name: string;
  readonly htmlUrl: string | null;
}

const emptySummary = (): StudentRepoEmailPreviewSummary => ({
  studentCount: 0,
  readyCount: 0,
  skippedCount: 0,
  missingEmailCount: 0,
  missingRepositoryCount: 0,
  inactiveCount: 0,
  alreadySentCount: 0
});

const renderTemplate = (template: string, values: Readonly<Record<string, string>>): string =>
  template.replace(/\{([a-z_]+)\}/gu, (match, key: string) => values[key] ?? match);

const readCourseContext = (courseFolderPath: string): { code: string; title: string } | null => {
  try {
    const document = parseDocument(
      fs.readFileSync(path.join(courseFolderPath, "course.yml"), "utf8")
    );
    const root = document.toJS() as { course?: { code?: unknown; title?: unknown } } | null;
    const code = root?.course?.code;
    const title = root?.course?.title;
    return typeof code === "string" && typeof title === "string" ? { code, title } : null;
  } catch {
    return null;
  }
};

const readManifestRepositories = (
  courseFolderPath: string,
  termCode: string,
  assignmentSlug: string
): {
  repositories: readonly ManifestRepository[];
  diagnostics: readonly CourseSetupDiagnostic[];
  exists: boolean;
} => {
  const manifestPath = path.join(
    courseFolderPath,
    "terms",
    termCode,
    "manifests",
    assignmentSlug,
    "manifest.yml"
  );
  if (!fs.existsSync(manifestPath)) return { repositories: [], diagnostics: [], exists: false };
  try {
    const root = parseDocument(fs.readFileSync(manifestPath, "utf8")).toJS() as {
      repositories?: unknown;
    };
    if (!Array.isArray(root.repositories)) throw new Error("Invalid repository records.");
    const repositories = root.repositories.flatMap((value): ManifestRepository[] => {
      if (typeof value !== "object" || value === null) return [];
      const record = value as {
        student_id?: unknown;
        github_username?: unknown;
        repository?: { name?: unknown; html_url?: unknown };
      };
      return typeof record.student_id === "string" &&
        typeof record.github_username === "string" &&
        typeof record.repository?.name === "string"
        ? [
            {
              studentId: record.student_id,
              githubUsername: record.github_username,
              name: record.repository.name,
              htmlUrl:
                typeof record.repository.html_url === "string" ? record.repository.html_url : null
            }
          ]
        : [];
    });
    return { repositories, diagnostics: [], exists: true };
  } catch {
    return {
      repositories: [],
      diagnostics: [diagnostic("Unable to load the assignment repository manifest.")],
      exists: true
    };
  }
};

const summarize = (
  recipients: readonly StudentRepoEmailRecipient[]
): StudentRepoEmailPreviewSummary => ({
  studentCount: recipients.length,
  readyCount: recipients.filter((recipient) => recipient.status === "ready").length,
  skippedCount: recipients.filter((recipient) => recipient.status === "skipped").length,
  missingEmailCount: recipients.filter((recipient) => recipient.status === "missing_email").length,
  missingRepositoryCount: recipients.filter(
    (recipient) => recipient.status === "missing_repository"
  ).length,
  inactiveCount: recipients.filter((recipient) => recipient.status === "skipped").length,
  alreadySentCount: recipients.filter((recipient) => recipient.status === "already_sent").length
});

export const getStudentRepoEmailPreview = (
  request: StudentRepoEmailPreviewRequest
): StudentRepoEmailPreviewResult => {
  const assignment = getAssignmentForEdit(request.courseFolderPath, request.assignmentFile);
  if (assignment.model === null) {
    return {
      status: "failure",
      assignmentFile: request.assignmentFile,
      courseCode: null,
      courseTitle: null,
      termCode: null,
      assignmentTitle: null,
      assignmentSlug: null,
      subjectTemplate: SUBJECT_TEMPLATE,
      bodyTemplate: BODY_TEMPLATE,
      summary: emptySummary(),
      recipients: [],
      diagnostics: assignment.diagnostics
    };
  }

  const course = readCourseContext(request.courseFolderPath);
  if (course === null) {
    return {
      status: "failure",
      assignmentFile: request.assignmentFile,
      courseCode: null,
      courseTitle: null,
      termCode: assignment.model.termCode,
      assignmentTitle: assignment.model.assignmentTitle,
      assignmentSlug: assignment.model.assignmentSlug,
      subjectTemplate: SUBJECT_TEMPLATE,
      bodyTemplate: BODY_TEMPLATE,
      summary: emptySummary(),
      recipients: [],
      diagnostics: [diagnostic("Unable to load course.yml for repository email preview.")]
    };
  }

  const manifest = readManifestRepositories(
    request.courseFolderPath,
    assignment.model.termCode,
    assignment.model.assignmentSlug
  );
  const repositories = manifest.repositories;
  const manifestDiagnostics = manifest.diagnostics;
  const recipients: StudentRepoEmailRecipient[] = [];
  const history = getStudentRepoEmailSendHistory(
    request.courseFolderPath,
    request.assignmentFile,
    assignment.model.termCode,
    assignment.model.assignmentSlug
  );

  for (const sectionId of assignment.model.sectionIds) {
    const roster = getRosterForSection({
      courseFolderId: request.courseFolderId,
      courseFolderPath: request.courseFolderPath,
      termCode: assignment.model.termCode,
      sectionId
    });
    if (roster.status !== "ready") {
      recipients.push({
        studentId: "",
        githubUsername: "",
        email: "",
        firstName: "",
        lastName: "",
        section: sectionId,
        status: "invalid_roster",
        repositoryName: null,
        repositoryUrl: null,
        subject: null,
        body: null,
        notificationKey: null,
        sentAt: null,
        diagnostics:
          roster.status === "migration_required"
            ? [
                diagnostic(
                  "Email preview requires the canonical seven-column roster schema with email and name fields."
                )
              ]
            : roster.diagnostics
      });
      continue;
    }
    for (const row of roster.rows) {
      const repository = repositories.find(
        (candidate) =>
          candidate.studentId === row.studentId && candidate.githubUsername === row.githubUsername
      );
      const base = {
        studentId: row.studentId,
        githubUsername: row.githubUsername,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        section: row.section,
        repositoryName: repository?.name ?? null,
        repositoryUrl: repository?.htmlUrl ?? null,
        notificationKey: null,
        sentAt: null
      };
      if (row.status !== "active") {
        recipients.push({
          ...base,
          status: "skipped",
          subject: null,
          body: null,
          diagnostics: [diagnostic(`Skipped: ${row.status}.`)]
        });
      } else if (row.email.trim() === "") {
        recipients.push({
          ...base,
          status: "missing_email",
          subject: null,
          body: null,
          diagnostics: [diagnostic("Roster row is missing an email address.")]
        });
      } else if (repository === undefined || repository.htmlUrl === null) {
        recipients.push({
          ...base,
          status: "missing_repository",
          subject: null,
          body: null,
          diagnostics: [diagnostic("No created repository was found for this student.")]
        });
      } else {
        const values = {
          first_name: row.firstName,
          last_name: row.lastName,
          student_id: row.studentId,
          github_username: row.githubUsername,
          email: row.email,
          course_code: course.code,
          course_title: course.title,
          term_code: assignment.model.termCode,
          assignment_title: assignment.model.assignmentTitle,
          assignment_slug: assignment.model.assignmentSlug,
          repository_name: repository.name,
          repository_url: repository.htmlUrl
        };
        const notificationKey = createStudentRepoEmailNotificationKey({
          assignmentFile: request.assignmentFile,
          assignmentSlug: assignment.model.assignmentSlug,
          studentId: row.studentId,
          email: row.email,
          repositoryUrl: repository.htmlUrl
        });
        const sentMessage =
          notificationKey === null
            ? undefined
            : history.messages.find(
                (message) =>
                  message.status === "sent" && message.notificationKey === notificationKey
              );
        recipients.push({
          ...base,
          status: sentMessage === undefined ? "ready" : "already_sent",
          notificationKey,
          sentAt: sentMessage?.sentAt ?? null,
          subject: renderTemplate(SUBJECT_TEMPLATE, values),
          body: renderTemplate(BODY_TEMPLATE, values),
          diagnostics:
            sentMessage === undefined ? [] : [diagnostic("Repository email was already sent.")]
        });
      }
    }
  }

  const summary = summarize(recipients);
  const noRepositories = !manifest.exists || repositories.length === 0;
  return {
    status:
      manifestDiagnostics.length > 0
        ? "failure"
        : noRepositories
          ? "not_ready"
          : summary.readyCount === recipients.length
            ? "success"
            : "partial",
    assignmentFile: request.assignmentFile,
    courseCode: course.code,
    courseTitle: course.title,
    termCode: assignment.model.termCode,
    assignmentTitle: assignment.model.assignmentTitle,
    assignmentSlug: assignment.model.assignmentSlug,
    subjectTemplate: SUBJECT_TEMPLATE,
    bodyTemplate: BODY_TEMPLATE,
    summary,
    recipients,
    diagnostics: [
      ...manifestDiagnostics,
      ...history.diagnostics,
      ...(noRepositories
        ? [
            diagnostic(
              "Repositories not created yet. Preview apply and apply the assignment first."
            )
          ]
        : [])
    ]
  };
};
