import fs from "node:fs";
import { z } from "zod";
import { parseYaml } from "../io/stable-yaml.js";
import { readTextFile } from "../io/file-system.js";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import {
  MANIFEST_LIFECYCLE_STATUSES,
  MANIFEST_SCHEMA_VERSION,
  MANIFEST_V2_SCHEMA_VERSION,
  type Manifest,
  type ManifestActionsState,
  type ManifestCollaboratorPermission,
  type ManifestLifecycleState,
  type ManifestOperationRecord,
  type ManifestPermissionState,
  type ManifestRepositoryIdentity,
  type ManifestRepositoryRecord,
  type ManifestTeamPermission
} from "./manifest-models.js";
import { sortManifestRepositories } from "./manifest-updater.js";

const MINIMUM_ITEMS = 1;
const EMPTY_INDEX = 0;

export interface ManifestLoadOptions {
  required?: boolean;
}

export type ManifestLoadResult =
  | {
      status: "loaded";
      manifest: Manifest;
      warnings: Diagnostic[];
      errors: Diagnostic[];
    }
  | {
      status: "missing";
      manifest?: undefined;
      warnings: Diagnostic[];
      errors: Diagnostic[];
    }
  | {
      status: "failure";
      manifest?: undefined;
      warnings: Diagnostic[];
      errors: Diagnostic[];
    };

const diagnosticSchema = z
  .object({
    code: z.string().min(MINIMUM_ITEMS),
    severity: z.union([z.literal("error"), z.literal("warning"), z.literal("info")]),
    message: z.string().min(MINIMUM_ITEMS),
    context: z.record(z.string(), z.unknown()).optional(),
    observedAt: z.string().optional()
  })
  .strict();

const sourceFileSchema = z
  .object({
    path: z.string().min(MINIMUM_ITEMS),
    sha256: z.string().min(MINIMUM_ITEMS)
  })
  .strict();

const permissionSchema = z.union([
  z.literal("pull"),
  z.literal("triage"),
  z.literal("push"),
  z.literal("maintain"),
  z.literal("admin")
]);

const collaboratorPermissionSchema = z
  .object({
    username: z.string().min(MINIMUM_ITEMS),
    permission: permissionSchema,
    pending_invite: z.boolean(),
    last_applied_at: z.string().optional(),
    last_observed_at: z.string().optional()
  })
  .strict();

const teamPermissionSchema = z
  .object({
    team_slug: z.string().min(MINIMUM_ITEMS),
    permission: permissionSchema,
    last_applied_at: z.string().optional(),
    last_observed_at: z.string().optional()
  })
  .strict();

const permissionStateSchema = z
  .object({
    student: collaboratorPermissionSchema.optional(),
    faculty_team: teamPermissionSchema.optional(),
    grader_team: teamPermissionSchema.optional()
  })
  .strict();

const repositoryIdentitySchema = z
  .object({
    owner: z.string().min(MINIMUM_ITEMS),
    name: z.string().min(MINIMUM_ITEMS),
    full_name: z.string().min(MINIMUM_ITEMS),
    id: z.number().optional(),
    html_url: z.string().optional(),
    created_from_template: z.boolean(),
    template_repository: z.string().min(MINIMUM_ITEMS),
    template_commit_sha: z.string().optional(),
    created_at: z.string().optional(),
    last_observed_at: z.string().optional()
  })
  .strict();

const actionsStateSchema = z
  .object({
    enabled: z.boolean(),
    grading_workflow_path: z.string().optional(),
    grading_workflow_found: z.boolean().optional(),
    workflow_dispatch_supported: z.boolean().optional(),
    last_observed_at: z.string().optional()
  })
  .strict();

const lifecycleStateSchema = z
  .object({
    repository_archived: z.boolean(),
    student_access_removed: z.boolean(),
    status: z.union(MANIFEST_LIFECYCLE_STATUSES.map((status) => z.literal(status))),
    last_changed_at: z.string().optional()
  })
  .strict();

const repositoryRecordSchema = z
  .object({
    student_id: z.string().min(MINIMUM_ITEMS),
    github_username: z.string().min(MINIMUM_ITEMS),
    section: z.string().min(MINIMUM_ITEMS),
    roster_status: z.union([z.literal("active"), z.literal("dropped"), z.literal("hold")]),
    repository: repositoryIdentitySchema,
    permissions: permissionStateSchema,
    actions: actionsStateSchema,
    lifecycle: lifecycleStateSchema,
    warnings: z.array(diagnosticSchema),
    errors: z.array(diagnosticSchema)
  })
  .strict();

const operationRecordSchema = z
  .object({
    command: z.string().min(MINIMUM_ITEMS),
    started_at: z.string().min(MINIMUM_ITEMS),
    completed_at: z.string().optional(),
    status: z.union([z.literal("success"), z.literal("failure"), z.literal("partial_success")]),
    summary: z.record(z.string(), z.unknown()),
    warnings: z.array(diagnosticSchema),
    errors: z.array(diagnosticSchema)
  })
  .strict();

const rawManifestSchema = z
  .object({
    schema_version: z.number(),
    assignment: z
      .object({
        term_code: z.string().min(MINIMUM_ITEMS),
        course_code: z.string().min(MINIMUM_ITEMS),
        assignment_slug: z.string().min(MINIMUM_ITEMS),
        assignment_title: z.string().min(MINIMUM_ITEMS)
      })
      .strict(),
    source: z
      .object({
        source_files: z.array(sourceFileSchema),
        input_fingerprint: z.string().min(MINIMUM_ITEMS)
      })
      .strict(),
    template: z
      .object({
        repository: z.string().min(MINIMUM_ITEMS),
        branch: z.string().min(MINIMUM_ITEMS),
        commit_sha: z.string().optional()
      })
      .strict(),
    repositories: z.array(repositoryRecordSchema),
    operation_history: z.array(operationRecordSchema),
    warnings: z.array(diagnosticSchema),
    errors: z.array(diagnosticSchema)
  })
  .strict();

const rawManifestV2Schema = z
  .object({
    schema_version: z.literal(MANIFEST_V2_SCHEMA_VERSION),
    repository_mode: z.enum(["individual", "group"]),
    targets: z.array(
      z
        .object({
          target_id: z.string().min(1),
          mode: z.enum(["individual", "group"]),
          group_id: z.string().min(1).optional(),
          repository_name: z.string().min(1),
          html_url: z.string().optional(),
          clone_url: z.string().optional(),
          section_ids: z.array(z.string().min(1)),
          student_ids: z.array(z.string().min(1)),
          github_usernames: z.array(z.string().min(1)),
          diagnostics: z.array(diagnosticSchema)
        })
        .strict()
    ),
    student_mappings: z.array(
      z
        .object({
          student_id: z.string().min(1),
          github_username: z.string().min(1),
          target_id: z.string().min(1),
          repository_name: z.string().min(1),
          html_url: z.string().optional(),
          clone_url: z.string().optional()
        })
        .strict()
    ),
    diagnostics: z.array(diagnosticSchema)
  })
  .strict();

type RawManifest = z.infer<typeof rawManifestSchema>;
type RawRepositoryRecord = z.infer<typeof repositoryRecordSchema>;
type RawPermissionState = z.infer<typeof permissionStateSchema>;
type RawRepositoryIdentity = z.infer<typeof repositoryIdentitySchema>;
type RawActionsState = z.infer<typeof actionsStateSchema>;
type RawLifecycleState = z.infer<typeof lifecycleStateSchema>;
type RawOperationRecord = z.infer<typeof operationRecordSchema>;

const createFailure = (errors: Diagnostic[]): ManifestLoadResult => ({
  status: "failure",
  warnings: [],
  errors
});

const createManifestMissingDiagnostic = (manifestPath: string): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.ManifestMissing,
    `Manifest ${manifestPath} was not found.`,
    {
      manifestPath
    }
  );

const createManifestSchemaVersionDiagnostic = (schemaVersion: number): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.InvalidManifestSchemaVersion,
    `Unsupported manifest schema version ${String(schemaVersion)}.`,
    {
      schemaVersion,
      supportedSchemaVersion: MANIFEST_SCHEMA_VERSION
    }
  );

const createManifestValidationDiagnostic = (
  code: string,
  filePath: string,
  issue: z.core.$ZodIssue
): Diagnostic =>
  createConfigDiagnostic(code, `Invalid manifest ${filePath}: ${issue.message}`, {
    filePath,
    path: issue.path.join("."),
    reason: issue.message
  });

const normalizeDiagnostic = (diagnostic: z.infer<typeof diagnosticSchema>): Diagnostic => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  ...(diagnostic.context === undefined ? {} : { context: diagnostic.context }),
  ...(diagnostic.observedAt === undefined ? {} : { observedAt: diagnostic.observedAt })
});

const getIssueCode = (issue: z.core.$ZodIssue): string => {
  const pathParts = issue.path.map(String);
  const path = pathParts.join(".");

  if (pathParts.length === MINIMUM_ITEMS) {
    return DiagnosticCode.MissingManifestSection;
  }

  if (path.endsWith("lifecycle.status")) {
    return DiagnosticCode.InvalidManifestLifecycleStatus;
  }

  if (path.endsWith("permission")) {
    return DiagnosticCode.InvalidManifestPermission;
  }

  if (path.startsWith("repositories.")) {
    return DiagnosticCode.InvalidManifestRepositoryRecord;
  }

  return DiagnosticCode.InvalidManifest;
};

const validateRawManifest = (filePath: string, value: unknown): ManifestLoadResult => {
  const schemaVersion = z
    .looseObject({
      schema_version: z.number()
    })
    .safeParse(value);

  if (schemaVersion.success && schemaVersion.data.schema_version === MANIFEST_V2_SCHEMA_VERSION) {
    const result = rawManifestV2Schema.safeParse(value);
    if (!result.success)
      return createFailure([
        createConfigDiagnostic(
          DiagnosticCode.InvalidManifest,
          `Invalid manifest ${filePath}: ${result.error.issues[0]?.message ?? "schema validation failed"}.`,
          { filePath }
        )
      ]);
    const ids = new Set<string>();
    const students = new Set<string>();
    const duplicate = result.data.targets.find((target) =>
      ids.has(target.target_id) ? true : (ids.add(target.target_id), false)
    );
    const mappingError = result.data.student_mappings.find(
      (mapping) =>
        !ids.has(mapping.target_id) ||
        (students.has(mapping.student_id) ? true : (students.add(mapping.student_id), false))
    );
    if (duplicate !== undefined || mappingError !== undefined)
      return createFailure([
        createConfigDiagnostic(
          DiagnosticCode.InvalidManifest,
          "Manifest v2 targets or student mappings are invalid.",
          { filePath }
        )
      ]);
    return {
      status: "loaded",
      warnings: [],
      errors: [],
      manifest: {
        schemaVersion: MANIFEST_V2_SCHEMA_VERSION,
        repositoryMode: result.data.repository_mode,
        targets: result.data.targets.map((target) => ({
          targetId: target.target_id,
          mode: target.mode,
          ...(target.group_id === undefined ? {} : { groupId: target.group_id }),
          repositoryName: target.repository_name,
          ...(target.html_url === undefined ? {} : { htmlUrl: target.html_url }),
          ...(target.clone_url === undefined ? {} : { cloneUrl: target.clone_url }),
          sectionIds: target.section_ids,
          studentIds: target.student_ids,
          githubUsernames: target.github_usernames,
          diagnostics: target.diagnostics.map(normalizeDiagnostic)
        })),
        studentMappings: result.data.student_mappings.map((mapping) => ({
          studentId: mapping.student_id,
          githubUsername: mapping.github_username,
          targetId: mapping.target_id,
          repositoryName: mapping.repository_name,
          ...(mapping.html_url === undefined ? {} : { htmlUrl: mapping.html_url }),
          ...(mapping.clone_url === undefined ? {} : { cloneUrl: mapping.clone_url })
        })),
        assignment: { termCode: "", courseCode: "", assignmentSlug: "", assignmentTitle: "" },
        source: { sourceFiles: [], inputFingerprint: "" },
        template: { repository: "", branch: "" },
        repositories: [],
        operationHistory: [],
        warnings: result.data.diagnostics.map(normalizeDiagnostic),
        errors: []
      }
    };
  }
  if (schemaVersion.success && schemaVersion.data.schema_version !== MANIFEST_SCHEMA_VERSION) {
    return createFailure([
      createManifestSchemaVersionDiagnostic(schemaVersion.data.schema_version)
    ]);
  }

  const schemaResult = rawManifestSchema.safeParse(value);

  if (!schemaResult.success) {
    const issue = schemaResult.error.issues[EMPTY_INDEX];

    return createFailure([
      issue === undefined
        ? createConfigDiagnostic(
            DiagnosticCode.InvalidManifest,
            `Invalid manifest ${filePath}: unknown schema validation failure.`,
            { filePath }
          )
        : createManifestValidationDiagnostic(getIssueCode(issue), filePath, issue)
    ]);
  }

  return {
    status: "loaded",
    manifest: normalizeManifest(schemaResult.data),
    warnings: [],
    errors: []
  };
};

const normalizeRepositoryIdentity = (
  repository: RawRepositoryIdentity
): ManifestRepositoryIdentity => ({
  owner: repository.owner,
  name: repository.name,
  fullName: repository.full_name,
  ...(repository.id === undefined ? {} : { id: repository.id }),
  ...(repository.html_url === undefined ? {} : { htmlUrl: repository.html_url }),
  createdFromTemplate: repository.created_from_template,
  templateRepository: repository.template_repository,
  ...(repository.template_commit_sha === undefined
    ? {}
    : { templateCommitSha: repository.template_commit_sha }),
  ...(repository.created_at === undefined ? {} : { createdAt: repository.created_at }),
  ...(repository.last_observed_at === undefined
    ? {}
    : { lastObservedAt: repository.last_observed_at })
});

const normalizePermissionState = (permissions: RawPermissionState): ManifestPermissionState => ({
  ...(permissions.student === undefined
    ? {}
    : {
        student: {
          username: permissions.student.username,
          permission: permissions.student.permission,
          pendingInvite: permissions.student.pending_invite,
          ...(permissions.student.last_applied_at === undefined
            ? {}
            : { lastAppliedAt: permissions.student.last_applied_at }),
          ...(permissions.student.last_observed_at === undefined
            ? {}
            : { lastObservedAt: permissions.student.last_observed_at })
        } satisfies ManifestCollaboratorPermission
      }),
  ...(permissions.faculty_team === undefined
    ? {}
    : { facultyTeam: normalizeTeamPermission(permissions.faculty_team) }),
  ...(permissions.grader_team === undefined
    ? {}
    : { graderTeam: normalizeTeamPermission(permissions.grader_team) })
});

const normalizeTeamPermission = (
  permission: z.infer<typeof teamPermissionSchema>
): ManifestTeamPermission => ({
  teamSlug: permission.team_slug,
  permission: permission.permission,
  ...(permission.last_applied_at === undefined
    ? {}
    : { lastAppliedAt: permission.last_applied_at }),
  ...(permission.last_observed_at === undefined
    ? {}
    : { lastObservedAt: permission.last_observed_at })
});

const normalizeActionsState = (actions: RawActionsState): ManifestActionsState => ({
  enabled: actions.enabled,
  ...(actions.grading_workflow_path === undefined
    ? {}
    : { gradingWorkflowPath: actions.grading_workflow_path }),
  ...(actions.grading_workflow_found === undefined
    ? {}
    : { gradingWorkflowFound: actions.grading_workflow_found }),
  ...(actions.workflow_dispatch_supported === undefined
    ? {}
    : { workflowDispatchSupported: actions.workflow_dispatch_supported }),
  ...(actions.last_observed_at === undefined ? {} : { lastObservedAt: actions.last_observed_at })
});

const normalizeLifecycleState = (lifecycle: RawLifecycleState): ManifestLifecycleState => ({
  repositoryArchived: lifecycle.repository_archived,
  studentAccessRemoved: lifecycle.student_access_removed,
  status: lifecycle.status,
  ...(lifecycle.last_changed_at === undefined ? {} : { lastChangedAt: lifecycle.last_changed_at })
});

const normalizeRepositoryRecord = (record: RawRepositoryRecord): ManifestRepositoryRecord => ({
  studentId: record.student_id,
  githubUsername: record.github_username,
  section: record.section,
  rosterStatus: record.roster_status,
  repository: normalizeRepositoryIdentity(record.repository),
  permissions: normalizePermissionState(record.permissions),
  actions: normalizeActionsState(record.actions),
  lifecycle: normalizeLifecycleState(record.lifecycle),
  warnings: record.warnings.map(normalizeDiagnostic),
  errors: record.errors.map(normalizeDiagnostic)
});

const normalizeOperationRecord = (operation: RawOperationRecord): ManifestOperationRecord => ({
  command: operation.command,
  startedAt: operation.started_at,
  ...(operation.completed_at === undefined ? {} : { completedAt: operation.completed_at }),
  status: operation.status,
  summary: operation.summary,
  warnings: operation.warnings.map(normalizeDiagnostic),
  errors: operation.errors.map(normalizeDiagnostic)
});

const normalizeManifest = (manifest: RawManifest): Manifest => ({
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  assignment: {
    termCode: manifest.assignment.term_code,
    courseCode: manifest.assignment.course_code,
    assignmentSlug: manifest.assignment.assignment_slug,
    assignmentTitle: manifest.assignment.assignment_title
  },
  source: {
    sourceFiles: manifest.source.source_files,
    inputFingerprint: manifest.source.input_fingerprint
  },
  template: {
    repository: manifest.template.repository,
    branch: manifest.template.branch,
    ...(manifest.template.commit_sha === undefined
      ? {}
      : { commitSha: manifest.template.commit_sha })
  },
  repositories: sortManifestRepositories(manifest.repositories.map(normalizeRepositoryRecord)),
  operationHistory: manifest.operation_history.map(normalizeOperationRecord),
  warnings: manifest.warnings.map(normalizeDiagnostic),
  errors: manifest.errors.map(normalizeDiagnostic)
});

export const loadManifest = (
  manifestPath: string,
  options: ManifestLoadOptions = {}
): ManifestLoadResult => {
  if (!fs.existsSync(manifestPath)) {
    return options.required === true
      ? createFailure([createManifestMissingDiagnostic(manifestPath)])
      : {
          status: "missing",
          warnings: [],
          errors: []
        };
  }

  const fileResult = readTextFile(manifestPath);

  if (fileResult.status === "failure") {
    return createFailure([fileResult.diagnostic]);
  }

  const yamlResult = parseYaml(fileResult.content, manifestPath);

  if (yamlResult.status === "failure") {
    return createFailure([yamlResult.diagnostic]);
  }

  return validateRawManifest(manifestPath, yamlResult.value);
};
