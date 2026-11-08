import { parse } from "yaml";
import { FakeManagedBranchClient } from "../../../src/github/fake-managed-branch-client.js";
import { FakeCoursePermissionClient } from "../../../src/github/fake-course-permission-client.js";
import { BasicCourse, completeSyntheticMigration } from "./synthetic-migration-fixtures.js";
import {
  buildMigrationCandidate,
  STAGED_PHASE_9_BOUNDARY
} from "../../../src/migration/migration-candidate.js";
import {
  migrationMetadataSchema,
  migrationCourseSchema
} from "../../../src/migration/migration-candidate-schemas.js";
import { rawTermConfigV2Schema } from "../../../src/config/config-schemas.js";
import {
  reconcilePublishedMigration,
  type ReconciliationStore
} from "../../../src/migration/migration-reconciliation.js";
import {
  type ReconciliationSnapshot,
  reconciliationValue
} from "../../../src/migration/migration-reconciliation-state.js";

const SHA_LENGTH = 40;
export const PUBLICATION = "b".repeat(SHA_LENGTH);
const DIGEST_LENGTH = 64;
const HEXADECIMAL_RADIX = 16;
export const INTENDED = "d".repeat(DIGEST_LENGTH);
export const reconciliationFixture = () => {
  const source = BasicCourse();
  const artifacts = completeSyntheticMigration(source, ["active"]);
  const candidate = buildMigrationCandidate({ ...artifacts, boundary: STAGED_PHASE_9_BOUNDARY });
  const file = (name: string) => {
    const result = candidate.files.find((entry) => entry.path === name);
    if (!result) throw new Error("Missing synthetic migration file.");
    return result.content;
  };
  const course = migrationCourseSchema.parse(parse(file("course.yml")));
  const terms = [rawTermConfigV2Schema.parse(parse(file("terms/27s1/term.yml")))];
  const metadata = migrationMetadataSchema.parse(JSON.parse(file(".graider/migration.json")));
  const identities = course.faculty_directory.map((f) => ({
    id: f.github_user_id,
    username: f.github_login
  }));
  const branches = new FakeManagedBranchClient(identities);
  const fallback = new FakeCoursePermissionClient(identities);
  const client = Object.assign(branches, {
    getCourseFallbackPermissionPage: fallback.getCourseFallbackPermissionPage.bind(fallback),
    setCourseFallbackPermission: fallback.setCourseFallbackPermission.bind(fallback)
  });
  client.accountId = course.fallback_administrator.github_user_id;
  client.organizationId = course.course.organization_binding.organization_id;
  fallback.organizationId = client.organizationId;
  Object.assign(fallback.repository, {
    id: course.course.repository_id,
    name: course.course.repository,
    node_id: `repository-${String(course.course.repository_id)}`,
    owner: { id: client.organizationId, login: course.github.organization, type: "Organization" }
  });
  client.addPermissionRepository(
    course.course.repository_id,
    course.github.organization,
    course.course.repository
  );
  client.organizationMembers.set(
    course.github.organization,
    course.faculty_directory.map((f) => ({ id: f.github_user_id, username: f.github_login }))
  );
  client.defaultBranches.set(course.course.repository_id, "main");
  client.branches.set(course.course.repository_id, new Set(["main"]));
  client.scopes = "repo admin:org";
  let revisionSequence = 0;
  let snapshot: ReconciliationSnapshot = {
    revision: PUBLICATION,
    publication: PUBLICATION,
    intendedFingerprint: INTENDED,
    source: source.binding.sourceCommitSha,
    checkpoint: `refs/tags/graider-migration-v1/${source.binding.sourceCommitSha}`,
    course,
    terms,
    metadata,
    targets: [],
    targetAttention: [],
    record: null
  };
  let currentAccount = client.accountId;
  let valid = true;
  const writes: unknown[] = [];
  const store: ReconciliationStore = {
    observe: () => Promise.resolve(structuredClone(snapshot)),
    assertCurrent: (observed) => {
      if (!valid || currentAccount !== client.accountId || observed.revision !== snapshot.revision)
        throw new Error("Stale authority");
      return Promise.resolve();
    },
    publish: (expected, record) => {
      if (expected !== snapshot.revision) throw new Error("Lost journal race");
      writes.push(structuredClone(record));
      revisionSequence++;
      snapshot = {
        ...snapshot,
        revision: revisionSequence.toString(HEXADECIMAL_RADIX).padStart(SHA_LENGTH, "0"),
        record: structuredClone(record)
      };
      return Promise.resolve(structuredClone(snapshot));
    }
  };
  const run = () =>
    reconcilePublishedMigration({ store, client, authenticatedUserId: currentAccount });
  return {
    client,
    course,
    terms,
    metadata,
    store,
    writes,
    run,
    get snapshot() {
      return snapshot;
    },
    setSnapshot: (value: ReconciliationSnapshot) => {
      snapshot = value;
    },
    invalidate: () => {
      valid = false;
    },
    switchAccount: (id: number) => {
      currentAccount = id;
      client.accountId = id;
    }
  };
};

export const LEGACY_TEAM_ID = 9000;
export const addLegacyGrant = (f: ReturnType<typeof reconciliationFixture>) => {
  const recovery = f.metadata.recovery;
  if (!recovery) throw new Error("Missing recovery fixture.");
  const plan = recovery.legacy;
  plan.status = "ready";
  plan.audit.inventory.status = "ready";
  plan.audit.inventory.candidate = {
    classification: "legacy_candidate",
    organizationId: f.client.organizationId,
    organizationLogin: f.course.github.organization,
    slug: "legacy-graders",
    teamId: LEGACY_TEAM_ID,
    membershipComplete: true,
    members: []
  };
  plan.audit.inventory.repositories = [
    {
      repositoryId: f.course.course.repository_id,
      owner: f.course.github.organization,
      name: f.course.course.repository,
      associationsComplete: true,
      associations: [
        {
          teamId: LEGACY_TEAM_ID,
          slug: "legacy-graders",
          permission: "push",
          parentId: null,
          legacyCandidate: true
        }
      ]
    }
  ];
  plan.reconciliation.grants = [
    {
      organizationId: f.client.organizationId,
      teamId: LEGACY_TEAM_ID,
      repositoryId: f.course.course.repository_id,
      observedPermission: "push",
      requires: "published_v2_and_verified_managed_replacement_access",
      replacement: {
        facultyDirectory: plan.audit.accessReview.facultyDirectory,
        terms: plan.facultyTerms,
        fallbackAdministratorGithubUserId: f.course.fallback_administrator.github_user_id,
        memberDecisions: []
      }
    }
  ];
  f.metadata.reconciliation.grants = [
    {
      organization_id: f.client.organizationId,
      team_id: LEGACY_TEAM_ID,
      repository_id: f.course.course.repository_id,
      observed_permission: "push",
      requires: "published_v2_and_verified_managed_replacement_access"
    }
  ];
  f.client.organizationTeams.push({
    id: LEGACY_TEAM_ID,
    name: "Legacy graders",
    slug: "legacy-graders",
    org: f.course.github.organization,
    description: null,
    parentId: null
  });
  reconciliationValue(f.client.repositoryGrants.get(f.course.course.repository_id)).set(
    LEGACY_TEAM_ID,
    "push"
  );
};
