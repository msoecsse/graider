import { describe, expect, it } from "vitest";
import type { Manifest, ManifestRepositoryRecord } from "../../../src/manifest/manifest-models.js";
import {
  appendOperationHistory,
  createEmptyManifest,
  updateActionsState,
  updateLifecycleState,
  updatePermissionState,
  updateRepositoryIdentity,
  upsertRepositoryRecord
} from "../../../src/manifest/manifest-updater.js";

const SOURCE_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const INPUT_FINGERPRINT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const createManifest = (): Manifest =>
  createEmptyManifest({
    assignment: {
      termCode: "27s1",
      courseCode: "se2030",
      assignmentSlug: "lab04",
      assignmentTitle: "Lab 04"
    },
    source: {
      sourceFiles: [
        {
          path: "course.yml",
          sha256: SOURCE_HASH
        }
      ],
      inputFingerprint: INPUT_FINGERPRINT
    },
    template: {
      repository: "example-org/lab04-template",
      branch: "main",
      commitSha: "template-sha"
    }
  });

const createRecord = (
  studentId: string,
  section: string,
  repositoryName: string
): ManifestRepositoryRecord => ({
  studentId,
  githubUsername: `${studentId}hub`,
  section,
  rosterStatus: "active",
  repository: {
    owner: "example-org",
    name: repositoryName,
    fullName: `example-org/${repositoryName}`,
    createdFromTemplate: true,
    templateRepository: "example-org/lab04-template"
  },
  permissions: {},
  actions: {
    enabled: false
  },
  lifecycle: {
    repositoryArchived: false,
    studentAccessRemoved: false,
    status: "created"
  },
  warnings: [],
  errors: []
});

describe("manifest updater", () => {
  it("creates an empty manifest from assignment and source context", () => {
    const manifest = createManifest();

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.repositories).toEqual([]);
    expect(manifest.source.inputFingerprint).toBe(INPUT_FINGERPRINT);
  });

  it("upsert repository record inserts new record", () => {
    const updated = upsertRepositoryRecord(
      createManifest(),
      createRecord("jones", "001", "repo-jones")
    );

    expect(updated.repositories).toHaveLength(1);
    expect(updated.repositories[0]?.studentId).toBe("jones");
  });

  it("upsert repository record updates existing record without duplicating", () => {
    const manifest = upsertRepositoryRecord(
      createManifest(),
      createRecord("jones", "001", "repo-jones")
    );
    const updated = upsertRepositoryRecord(manifest, {
      ...createRecord("jones", "001", "repo-jones-renamed"),
      githubUsername: "seanjones"
    });

    expect(updated.repositories).toHaveLength(1);
    expect(updated.repositories[0]).toMatchObject({
      studentId: "jones",
      githubUsername: "seanjones",
      repository: {
        name: "repo-jones-renamed"
      }
    });
  });

  it("repository records sort by section, student ID, repository name", () => {
    const manifest = [
      createRecord("patel", "002", "repo-patel"),
      createRecord("smith", "001", "repo-smith"),
      createRecord("jones", "001", "repo-jones")
    ].reduce(upsertRepositoryRecord, createManifest());

    expect(manifest.repositories.map((record) => record.repository.name)).toEqual([
      "repo-jones",
      "repo-smith",
      "repo-patel"
    ]);
  });

  it("TC-MANIFEST-005 manifest preserves existing repo identity data", () => {
    const manifest = upsertRepositoryRecord(
      createManifest(),
      createRecord("jones", "001", "repo-jones")
    );
    const updated = updateRepositoryIdentity(manifest, {
      studentId: "jones",
      repository: {
        lastObservedAt: "2026-09-01T14:30:00.000Z"
      }
    });

    expect(updated.repositories[0]?.repository).toMatchObject({
      owner: "example-org",
      name: "repo-jones",
      fullName: "example-org/repo-jones",
      lastObservedAt: "2026-09-01T14:30:00.000Z"
    });
  });

  it("updates permission state", () => {
    const manifest = upsertRepositoryRecord(
      createManifest(),
      createRecord("jones", "001", "repo-jones")
    );
    const updated = updatePermissionState(manifest, {
      studentId: "jones",
      permissions: {
        student: {
          username: "seanjones",
          permission: "push",
          pendingInvite: false
        }
      }
    });

    expect(updated.repositories[0]?.permissions.student).toMatchObject({
      username: "seanjones",
      permission: "push"
    });
  });

  it("updates Actions state", () => {
    const manifest = upsertRepositoryRecord(
      createManifest(),
      createRecord("jones", "001", "repo-jones")
    );
    const updated = updateActionsState(manifest, {
      studentId: "jones",
      actions: {
        enabled: true,
        gradingWorkflowFound: true
      }
    });

    expect(updated.repositories[0]?.actions).toMatchObject({
      enabled: true,
      gradingWorkflowFound: true
    });
  });

  it("TC-MANIFEST-006 manifest updates lifecycle fields", () => {
    const manifest = upsertRepositoryRecord(
      createManifest(),
      createRecord("jones", "001", "repo-jones")
    );
    const updated = updateLifecycleState(manifest, {
      studentId: "jones",
      lifecycle: {
        repositoryArchived: true,
        status: "archived",
        lastChangedAt: "2026-09-01T15:00:00.000Z"
      }
    });

    expect(updated.repositories[0]?.lifecycle).toMatchObject({
      repositoryArchived: true,
      studentAccessRemoved: false,
      status: "archived",
      lastChangedAt: "2026-09-01T15:00:00.000Z"
    });
  });

  it("operation history append preserves prior entries", () => {
    const first = appendOperationHistory(createManifest(), {
      command: "apply",
      startedAt: "2026-09-01T14:00:00.000Z",
      status: "success",
      summary: {},
      warnings: [],
      errors: []
    });
    const second = appendOperationHistory(first, {
      command: "report",
      startedAt: "2026-09-01T15:00:00.000Z",
      status: "success",
      summary: {},
      warnings: [],
      errors: []
    });

    expect(second.operationHistory.map((operation) => operation.command)).toEqual([
      "apply",
      "report"
    ]);
  });
});
