import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type {
  Manifest,
  ManifestActionsState,
  ManifestCollaboratorPermission,
  ManifestLifecycleState,
  ManifestOperationRecord,
  ManifestPermissionState,
  ManifestRepositoryIdentity,
  ManifestRepositoryRecord,
  ManifestTeamPermission
} from "./manifest-models.js";
import { sortManifestRepositories } from "./manifest-updater.js";

const YAML_INDENT_SPACES = 2;
const LINE_WIDTH_DISABLED = 0;

export interface ManifestWriteResult {
  status: "success" | "failure";
  diagnostic?: Diagnostic;
}

type RawManifest = ReturnType<typeof toRawManifest>;

const optionalEntries = <T extends Record<string, unknown>>(entries: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined)
  ) as Partial<T>;

const toRawRepositoryIdentity = (repository: ManifestRepositoryIdentity) => ({
  owner: repository.owner,
  name: repository.name,
  full_name: repository.fullName,
  ...optionalEntries({
    id: repository.id,
    html_url: repository.htmlUrl
  }),
  created_from_template: repository.createdFromTemplate,
  template_repository: repository.templateRepository,
  ...optionalEntries({
    template_commit_sha: repository.templateCommitSha,
    created_at: repository.createdAt,
    last_observed_at: repository.lastObservedAt
  })
});

const toRawCollaboratorPermission = (permission: ManifestCollaboratorPermission) => ({
  username: permission.username,
  permission: permission.permission,
  pending_invite: permission.pendingInvite,
  ...optionalEntries({
    last_applied_at: permission.lastAppliedAt,
    last_observed_at: permission.lastObservedAt
  })
});

const toRawTeamPermission = (permission: ManifestTeamPermission) => ({
  team_slug: permission.teamSlug,
  permission: permission.permission,
  ...optionalEntries({
    last_applied_at: permission.lastAppliedAt,
    last_observed_at: permission.lastObservedAt
  })
});

const toRawPermissionState = (permissions: ManifestPermissionState) => ({
  ...optionalEntries({
    student:
      permissions.student === undefined
        ? undefined
        : toRawCollaboratorPermission(permissions.student),
    faculty_team:
      permissions.facultyTeam === undefined
        ? undefined
        : toRawTeamPermission(permissions.facultyTeam),
    grader_team:
      permissions.graderTeam === undefined ? undefined : toRawTeamPermission(permissions.graderTeam)
  })
});

const toRawActionsState = (actions: ManifestActionsState) => ({
  enabled: actions.enabled,
  ...optionalEntries({
    grading_workflow_path: actions.gradingWorkflowPath,
    grading_workflow_found: actions.gradingWorkflowFound,
    workflow_dispatch_supported: actions.workflowDispatchSupported,
    last_observed_at: actions.lastObservedAt
  })
});

const toRawLifecycleState = (lifecycle: ManifestLifecycleState) => ({
  repository_archived: lifecycle.repositoryArchived,
  student_access_removed: lifecycle.studentAccessRemoved,
  status: lifecycle.status,
  ...optionalEntries({
    last_changed_at: lifecycle.lastChangedAt
  })
});

const toRawRepositoryRecord = (record: ManifestRepositoryRecord) => ({
  student_id: record.studentId,
  github_username: record.githubUsername,
  section: record.section,
  roster_status: record.rosterStatus,
  repository: toRawRepositoryIdentity(record.repository),
  permissions: toRawPermissionState(record.permissions),
  actions: toRawActionsState(record.actions),
  lifecycle: toRawLifecycleState(record.lifecycle),
  warnings: record.warnings,
  errors: record.errors
});

const toRawOperationHistory = (operation: ManifestOperationRecord) => ({
  command: operation.command,
  started_at: operation.startedAt,
  ...optionalEntries({
    completed_at: operation.completedAt
  }),
  status: operation.status,
  summary: operation.summary,
  warnings: operation.warnings,
  errors: operation.errors
});

const toRawManifest = (manifest: Manifest) => ({
  schema_version: manifest.schemaVersion,
  assignment: {
    term_code: manifest.assignment.termCode,
    course_code: manifest.assignment.courseCode,
    assignment_slug: manifest.assignment.assignmentSlug,
    assignment_title: manifest.assignment.assignmentTitle
  },
  source: {
    source_files: manifest.source.sourceFiles,
    input_fingerprint: manifest.source.inputFingerprint
  },
  template: {
    repository: manifest.template.repository,
    branch: manifest.template.branch,
    ...optionalEntries({
      commit_sha: manifest.template.commitSha
    })
  },
  repositories: sortManifestRepositories(manifest.repositories).map(toRawRepositoryRecord),
  operation_history: manifest.operationHistory.map(toRawOperationHistory),
  warnings: manifest.warnings,
  errors: manifest.errors
});

export const renderManifestYaml = (manifest: Manifest): string =>
  stringify(toRawManifest(manifest), {
    indent: YAML_INDENT_SPACES,
    lineWidth: LINE_WIDTH_DISABLED
  });

export const writeManifest = (manifestPath: string, manifest: Manifest): ManifestWriteResult => {
  try {
    fs.mkdirSync(path.dirname(manifestPath), {
      recursive: true
    });
    fs.writeFileSync(manifestPath, renderManifestYaml(manifest), "utf8");

    return {
      status: "success"
    };
  } catch (error: unknown) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        DiagnosticCode.ManifestWriteFailed,
        "Failed to write manifest.",
        {
          manifestPath,
          reason: error instanceof Error ? error.message : "unknown"
        }
      )
    };
  }
};

export type RawRenderedManifest = RawManifest;
