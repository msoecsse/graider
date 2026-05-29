import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type {
  Manifest,
  ManifestActionsState,
  ManifestAssignment,
  ManifestLifecycleState,
  ManifestOperationRecord,
  ManifestPermissionState,
  ManifestRepositoryIdentity,
  ManifestRepositoryRecord,
  ManifestSource,
  ManifestTemplate
} from "./manifest-models.js";
import { MANIFEST_SCHEMA_VERSION } from "./manifest-models.js";

const MISSING_INDEX = -1;
const EMPTY_DIAGNOSTICS: Diagnostic[] = [];

export interface CreateManifestInput {
  assignment: ManifestAssignment;
  source: ManifestSource;
  template: ManifestTemplate;
  warnings?: Diagnostic[];
  errors?: Diagnostic[];
}

export interface UpdateRepositoryIdentityInput {
  studentId: string;
  repository: Partial<ManifestRepositoryIdentity>;
}

export interface UpdatePermissionStateInput {
  studentId: string;
  permissions: Partial<ManifestPermissionState>;
}

export interface UpdateActionsStateInput {
  studentId: string;
  actions: Partial<ManifestActionsState>;
}

export interface UpdateLifecycleStateInput {
  studentId: string;
  lifecycle: Partial<ManifestLifecycleState>;
}

export const compareManifestRepositoryRecords = (
  left: ManifestRepositoryRecord,
  right: ManifestRepositoryRecord
): number =>
  left.section.localeCompare(right.section) ||
  left.studentId.localeCompare(right.studentId) ||
  left.repository.name.localeCompare(right.repository.name);

export const sortManifestRepositories = (
  repositories: readonly ManifestRepositoryRecord[]
): ManifestRepositoryRecord[] => [...repositories].sort(compareManifestRepositoryRecords);

export const createEmptyManifest = ({
  assignment,
  source,
  template,
  warnings = EMPTY_DIAGNOSTICS,
  errors = EMPTY_DIAGNOSTICS
}: CreateManifestInput): Manifest => ({
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  assignment,
  source,
  template,
  repositories: [],
  operationHistory: [],
  warnings: [...warnings],
  errors: [...errors]
});

const repositoryRecordIndex = (manifest: Manifest, studentId: string): number =>
  manifest.repositories.findIndex((record) => record.studentId === studentId);

const mergeRepositoryRecord = (
  existing: ManifestRepositoryRecord,
  incoming: ManifestRepositoryRecord
): ManifestRepositoryRecord => ({
  ...existing,
  ...incoming,
  repository: {
    ...existing.repository,
    ...incoming.repository
  },
  permissions: {
    ...existing.permissions,
    ...incoming.permissions
  },
  actions: {
    ...existing.actions,
    ...incoming.actions
  },
  lifecycle: {
    ...existing.lifecycle,
    ...incoming.lifecycle
  },
  warnings: incoming.warnings,
  errors: incoming.errors
});

const updateRepositoryRecord = (
  manifest: Manifest,
  studentId: string,
  updater: (record: ManifestRepositoryRecord) => ManifestRepositoryRecord
): Manifest => ({
  ...manifest,
  repositories: sortManifestRepositories(
    manifest.repositories.map((record) =>
      record.studentId === studentId ? updater(record) : record
    )
  )
});

export const upsertRepositoryRecord = (
  manifest: Manifest,
  record: ManifestRepositoryRecord
): Manifest => {
  const existingIndex = repositoryRecordIndex(manifest, record.studentId);
  const repositories =
    existingIndex === MISSING_INDEX
      ? [...manifest.repositories, record]
      : manifest.repositories.map((existingRecord, index) =>
          index === existingIndex ? mergeRepositoryRecord(existingRecord, record) : existingRecord
        );

  return {
    ...manifest,
    repositories: sortManifestRepositories(repositories)
  };
};

export const updateRepositoryIdentity = (
  manifest: Manifest,
  input: UpdateRepositoryIdentityInput
): Manifest =>
  updateRepositoryRecord(manifest, input.studentId, (record) => ({
    ...record,
    repository: {
      ...record.repository,
      ...input.repository
    }
  }));

export const updatePermissionState = (
  manifest: Manifest,
  input: UpdatePermissionStateInput
): Manifest =>
  updateRepositoryRecord(manifest, input.studentId, (record) => ({
    ...record,
    permissions: {
      ...record.permissions,
      ...input.permissions
    }
  }));

export const updateActionsState = (manifest: Manifest, input: UpdateActionsStateInput): Manifest =>
  updateRepositoryRecord(manifest, input.studentId, (record) => ({
    ...record,
    actions: {
      ...record.actions,
      ...input.actions
    }
  }));

export const updateLifecycleState = (
  manifest: Manifest,
  input: UpdateLifecycleStateInput
): Manifest =>
  updateRepositoryRecord(manifest, input.studentId, (record) => ({
    ...record,
    lifecycle: {
      ...record.lifecycle,
      ...input.lifecycle
    }
  }));

export const appendOperationHistory = (
  manifest: Manifest,
  operation: ManifestOperationRecord
): Manifest => ({
  ...manifest,
  operationHistory: [...manifest.operationHistory, operation]
});
