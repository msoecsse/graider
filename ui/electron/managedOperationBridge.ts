import path from "node:path";
import type * as Backend from "../dist-electron/managedOperationBackend.cjs";
import {
  managedOperationFamily,
  MANAGED_V2_LOCAL_READ_CHANNELS
} from "./managedOperationInventory.js";
import { IPC_CHANNELS } from "./ipc.js";
import { blockMutation, type VerifiedCourseMutationContext } from "./managedCourseMutationGuard.js";
import type { LocalCourseReadInput, ManagedOperationInput } from "./githubOAuthSession.js";
import { changeManagedCourseLifecycle } from "./courseLifecycleService.js";
import { requireReadRevision } from "./managedCourseTransaction.js";
import fs from "node:fs";
import type { VerifiedLocalCourseReadContext } from "./managedCourseMutationTypes.js";
import { verifyCurrentMigrationAccess } from "./migrationReconciliationService.js";
import type {
  AuthenticatedGitWorkspaceContext,
  GitWorkspaceFactory
} from "./gitWorkspaceReader.js";

export interface ManagedOperationRequest {
  readonly channel: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly onChanged?: (context: VerifiedCourseMutationContext) => void;
}
const loadBackend = (): typeof Backend =>
  require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "managedOperationBackend.cjs"
    )
  );

/** Only this closed adapter reaches Schema 2. No legacy handler or renderer validator is invoked. */
export const performManagedV2Operation = async (
  request: ManagedOperationRequest,
  trusted:
    | {
        readonly kind?: "remote";
        readonly userData: string;
        readonly context: VerifiedCourseMutationContext;
        readonly input: ManagedOperationInput;
        readonly revalidate: () => Promise<void>;
        readonly changed: () => void;
        readonly factory?: GitWorkspaceFactory;
        readonly authenticate?: (token: string) => AuthenticatedGitWorkspaceContext;
      }
    | {
        readonly kind: "local_read";
        readonly context: VerifiedLocalCourseReadContext;
        readonly input: LocalCourseReadInput;
        readonly assertCurrent: () => void;
      }
) => {
  if (trusted.kind === "local_read") {
    if (!MANAGED_V2_LOCAL_READ_CHANNELS.includes(request.channel))
      blockMutation(
        "operation_unavailable",
        "This Schema 2 operation does not support local reads."
      );
    trusted.assertCurrent();
    const result = performManagedV2Read(
      request,
      trusted.context.courseFolderPath,
      trusted.input,
      trusted.context.cachedCommit
    );
    trusted.assertCurrent();
    return result;
  }
  const { context, input } = trusted;
  const { channel, fields } = request;
  const backend = loadBackend();
  const identity = {
    userId: input.userId,
    repositoryId: input.course.repositoryId,
    organizationId: input.course.organizationId,
    organization: input.course.organizationLogin
  };
  const root = context.courseFolderPath;
  await trusted.revalidate();
  const state = backend.readManagedOperationState(root, identity);
  if (channel === IPC_CHANNELS.changeManagedTermLifecycle) {
    requireReadRevision(fields.expectedCourseRevision, context);
    const operation = fields.operation;
    if (
      typeof fields.targetTermCode !== "string" ||
      (operation !== "activate" &&
        operation !== "delete-draft" &&
        operation !== "safe-rollback" &&
        operation !== "accept-current" &&
        operation !== "restore-predecessor")
    )
      throw new Error("Choose an explicit supported term lifecycle operation.");
    let allowed = false;
    try {
      allowed = backend.authorizeManagedTermLifecycle(
        root,
        identity,
        fields.targetTermCode,
        operation
      ).allowed;
    } catch {
      blockMutation(
        "operation_not_authorized",
        "Term lifecycle or role evidence is invalid. Refresh Course details."
      );
    }
    if (!allowed)
      blockMutation(
        "operation_not_authorized",
        "This account has no authority for that term lifecycle action."
      );
    return Object.freeze({
      status: "needs_attention",
      reason: "trusted-lifecycle-evidence-unavailable",
      message:
        "Term lifecycle execution requires a complete current student-target inventory, durable reconciliation journals and, for deletion/rollback, exact-source remote activity-absence evidence. These are unavailable in the current production composition; no lifecycle or student data was changed."
    });
  }
  if (channel === IPC_CHANNELS.changeManagedCourseLifecycle) {
    requireReadRevision(fields.expectedCourseRevision, context);
    if (fields.targetStatus !== "archived" && fields.targetStatus !== "unarchived")
      throw new Error("Choose an explicit course lifecycle action.");
    if (await backend.hasUnresolvedManagedReadiness(root))
      blockMutation(
        "reconciliation_required",
        "Course migration or reconciliation needs attention before lifecycle changes."
      );
    if (
      fs.existsSync(path.join(root, ".graider/migration.json")) &&
      !(await verifyCurrentMigrationAccess({
        userData: trusted.userData,
        input,
        ...(trusted.factory ? { factory: trusted.factory } : {}),
        ...(trusted.authenticate ? { authenticate: trusted.authenticate } : {})
      }))
    )
      blockMutation(
        "reconciliation_required",
        "Required current GitHub access could not be independently verified. Reconcile migration before lifecycle changes."
      );
    return changeManagedCourseLifecycle({
      userData: trusted.userData,
      context,
      // The Phase 8 codec checks the persisted locator. The outer closure independently
      // verifies current immutable repository/org IDs, including same-ID renames.
      input: {
        ...input,
        course: { ...input.course, organizationLogin: state.course.github.organization }
      },
      expectedRevision: fields.expectedCourseRevision,
      targetStatus: fields.targetStatus,
      revalidateRepository: trusted.revalidate,
      changed: trusted.changed,
      ...(trusted.factory ? { factory: trusted.factory } : {}),
      ...(trusted.authenticate ? { authenticate: trusted.authenticate } : {}),
      author: {
        name: `faculty-${input.userId}`,
        email: `${input.userId}+faculty@users.noreply.github.com`
      }
    });
  }
  const family = managedOperationFamily(channel);
  return blockMutation(
    "operation_unavailable",
    `Schema 2 ${family} is unavailable (${backend.MANAGED_OPERATION_SUPPORT[family]}). Preserved data remains unchanged; use Course details for metadata.`
  );
};

/** Shared backend policy retains section and role restrictions on token-free local evidence. */
const performManagedV2Read = (
  request: ManagedOperationRequest,
  root: string,
  input: LocalCourseReadInput,
  commit: string
) => {
  const backend = loadBackend();
  const { channel, fields } = request;
  const identity = {
    userId: input.userId,
    repositoryId: input.course.repositoryId,
    organizationId: input.course.organizationId,
    organization: input.course.organizationLogin
  };
  const version = {
    courseReadRevision: commit,
    courseReadRevisionSource: "local_cache" as const,
    readOnly: true
  };
  const unavailable = (message: string): never => blockMutation("operation_unavailable", message);
  const scope =
    fields.scope === undefined || fields.scope === "default"
      ? "default"
      : fields.scope === "coordinator-term"
        ? "coordinator-term"
        : null;
  if (!scope) blockMutation("operation_not_authorized", "Invalid coordinator scope.");
  let result: unknown;
  try {
    if (channel === IPC_CHANNELS.loadRosterTerms)
      result = {
        ...version,
        terms: backend.readManagedRosterTerms(root, identity, scope!),
        diagnostics: []
      };
    else if (
      channel === IPC_CHANNELS.getRosterForSection ||
      channel === IPC_CHANNELS.getRosterSectionSummaries
    ) {
      if (
        typeof fields.termCode !== "string" ||
        (channel === IPC_CHANNELS.getRosterForSection && typeof fields.sectionId !== "string")
      )
        throw new Error("A term and section are required.");
      const evidence = backend.readManagedRoster(
        root,
        identity,
        fields.termCode,
        channel === IPC_CHANNELS.getRosterForSection ? String(fields.sectionId) : undefined,
        scope!
      );
      if (channel === IPC_CHANNELS.getRosterForSection) {
        const section = evidence.sections[0]!;
        result = {
          ...version,
          status: evidence.roster.errors.length ? "invalid" : "ready",
          path: section.roster ? `terms/${fields.termCode}/${section.roster}` : "",
          exists: !!section.roster,
          faculty: [],
          facultyGithubUserIds: section.faculty.current.map((ref) => ref.github_user_id),
          rows: evidence.roster.errors.length ? [] : evidence.roster.students,
          diagnostics: evidence.roster.errors.map((error) => ({ message: error.message }))
        };
      } else
        result = {
          ...version,
          status: "ready",
          diagnostics: [],
          summaries: evidence.sections.map((section) => {
            const students = evidence.roster.students.filter(
              (student) => student.section === section.id
            );
            return {
              sectionId: section.id,
              status: !section.roster
                ? "missing"
                : evidence.roster.errors.length
                  ? "invalid"
                  : "ready",
              exists: !!section.roster,
              studentCount: students.length,
              activeStudentCount: students.filter((student) => student.status === "active").length,
              droppedStudentCount: students.filter((student) => student.status === "dropped")
                .length,
              holdStudentCount: students.filter((student) => student.status === "hold").length,
              diagnostics: []
            };
          })
        };
    } else if (channel === IPC_CHANNELS.loadGradingCommentLibrary) {
      if (typeof fields.termCode !== "string") throw new Error("A term is required.");
      const library = backend.readManagedComments(root, identity, fields.termCode);
      result =
        library.status === "success"
          ? { ...version, status: "success", comments: library.value.comments }
          : library;
    } else {
      const family = managedOperationFamily(channel);
      unavailable(
        `Schema 2 ${family} is unavailable (${backend.MANAGED_OPERATION_SUPPORT[family]}). Preserved data remains unchanged; use Course details for metadata.`
      );
    }
  } catch (error) {
    if (error instanceof Error && "result" in error) throw error;
    blockMutation(
      "operation_not_authorized",
      "The requested section or preserved evidence is unavailable to this account. Refresh Course details."
    );
  }
  return result;
};
