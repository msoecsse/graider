import { measureGradingOperation, measureGradingPhase } from "./gradingPerformance.js";
import { projectManagedCourseResult } from "./managedCourseResultProjection.js";
import {
  managedCourseOperation,
  courseOperationDocument,
  reviewImportPreparation
} from "./managedCourseOperationContext.js";
import { requireReadRevision } from "./managedCourseTransaction.js";
import type { VerifiedCourseMutationContext } from "./managedCourseMutationGuard.js";
import type { IpcMain, WebContents } from "electron";
import { IPC_CHANNELS } from "./ipc.js";
import {
  CourseMutationBlocked,
  blockMutation,
  type ManagedCourseMutationGuard
} from "./managedCourseMutationGuard.js";
import {
  courseContextRevision,
  type VerifiedCourseOperationContext,
  COURSE_MUTATION_NOTICE
} from "./managedCourseMutationTypes.js";
import {
  COURSE_RUNTIME_MUTATION_CHANNELS,
  LOCAL_GRADING_MUTATION_CHANNELS
} from "./managedOperationInventory.js";

const executeCourseOperation = <T>(
  senderId: number,
  channel: string,
  operation: () => Promise<T>
) => measureGradingOperation(channel, () => courseOperationDocument.run(senderId, operation));

/** Explicit inventory: all handlers are wrapped before their first local/remote write. */
export const COURSE_MUTATION_CHANNELS: readonly string[] = [
  IPC_CHANNELS.changeManagedCourseLifecycle,
  IPC_CHANNELS.changeManagedTermLifecycle,
  ...COURSE_RUNTIME_MUTATION_CHANNELS,
  IPC_CHANNELS.saveCourseSetup,
  IPC_CHANNELS.saveRoster,
  IPC_CHANNELS.removeRoster,
  IPC_CHANNELS.removeSection,
  IPC_CHANNELS.saveAssignmentSetup,
  IPC_CHANNELS.saveAssignmentEdit,
  IPC_CHANNELS.deleteAssignment,
  IPC_CHANNELS.saveAssignmentGroupConfig,
  IPC_CHANNELS.saveStudentAccessPagesConfig,
  IPC_CHANNELS.createGradingLibraryComment,
  IPC_CHANNELS.editGradingLibraryComment,
  IPC_CHANNELS.deleteGradingLibraryComment,
  IPC_CHANNELS.publishCourseChanges,
  IPC_CHANNELS.applyAssignment,
  IPC_CHANNELS.gradeAssignment,
  IPC_CHANNELS.repairGradingStudentWorkflow,
  IPC_CHANNELS.repairGradingAssignmentWorkflows,
  IPC_CHANNELS.publishGradingStudentReport,
  IPC_CHANNELS.bulkPublishGradingStudentReports,
  IPC_CHANNELS.publishStudentRepositoryAccessPage,
  IPC_CHANNELS.saveTemplateWorkflow,
  IPC_CHANNELS.replaceTemplateManagedWorkflow,
  IPC_CHANNELS.executeAssignmentTemplateSync
];
export const COURSE_ADMIN_CHANNELS: readonly string[] = [
  IPC_CHANNELS.saveCourseSetup,
  IPC_CHANNELS.saveRoster,
  IPC_CHANNELS.removeRoster,
  IPC_CHANNELS.removeSection,
  IPC_CHANNELS.saveAssignmentSetup,
  IPC_CHANNELS.saveAssignmentEdit,
  IPC_CHANNELS.deleteAssignment,
  IPC_CHANNELS.saveAssignmentGroupConfig,
  IPC_CHANNELS.saveStudentAccessPagesConfig,
  IPC_CHANNELS.createGradingLibraryComment,
  IPC_CHANNELS.editGradingLibraryComment,
  IPC_CHANNELS.deleteGradingLibraryComment
];
const EDIT_PREVIEWS: readonly string[] = [
  IPC_CHANNELS.previewAssignmentSetup,
  IPC_CHANNELS.previewAssignmentEdit,
  IPC_CHANNELS.previewRosterSave,
  IPC_CHANNELS.previewCourseSetup
];
/** Scope each transaction to the domain paths this explicit action can generate. */
export const allowedCourseMutationPath = (
  channel: string,
  fields: Record<string, unknown>,
  file: string
): boolean => {
  if (
    (
      [
        IPC_CHANNELS.createGradingLibraryComment,
        IPC_CHANNELS.editGradingLibraryComment,
        IPC_CHANNELS.deleteGradingLibraryComment
      ] as readonly string[]
    ).includes(channel)
  )
    return file === ".graider/grading/comments.json";
  if (channel === IPC_CHANNELS.saveStudentAccessPagesConfig) return file === "course.yml";
  const term =
    typeof fields.termCode === "string" && /^\d{2}s[123]$/u.test(fields.termCode)
      ? fields.termCode
      : null;
  if (channel === IPC_CHANNELS.saveCourseSetup)
    return (
      file === "course.yml" ||
      (!!term && (file === `terms/${term}/term.yml` || file.startsWith(`terms/${term}/rosters/`)))
    );
  if (
    (
      [
        IPC_CHANNELS.saveRoster,
        IPC_CHANNELS.removeRoster,
        IPC_CHANNELS.removeSection
      ] as readonly string[]
    ).includes(channel)
  ) {
    const section =
      typeof fields.sectionId === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(fields.sectionId)
        ? fields.sectionId
        : null;
    return (
      !!term &&
      !!section &&
      [
        `terms/${term}/term.yml`,
        `terms/${term}/rosters/section-${section}.csv`,
        `terms/${term}/rosters/section-${section}.source.json`
      ].includes(file)
    );
  }
  const assignment =
    channel === IPC_CHANNELS.saveAssignmentSetup &&
    term &&
    typeof fields.assignmentSlug === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(fields.assignmentSlug)
      ? `terms/${term}/assignments/${fields.assignmentSlug}/assignment.yml`
      : fields.assignmentFile;
  if (
    typeof assignment !== "string" ||
    !/^terms\/\d{2}s[123]\/assignments\/[A-Za-z0-9][A-Za-z0-9._-]*\/assignment\.yml$/u.test(
      assignment
    ) ||
    assignment.includes("..")
  )
    return false;
  const directory = assignment.slice(0, -"assignment.yml".length);
  return (
    file === assignment ||
    (channel === IPC_CHANNELS.saveAssignmentGroupConfig && file === `${directory}groups.csv`) ||
    ((
      [IPC_CHANNELS.saveAssignmentSetup, IPC_CHANNELS.deleteAssignment] as readonly string[]
    ).includes(channel) &&
      file === `${directory}.github/workflows/grade.yml`)
  );
};
/** No generic IPC is exposed. The adapter only registers the existing explicit channels. */
export const createCourseMutationIpc = (
  ipc: Pick<IpcMain, "handle">,
  guard: () => ManagedCourseMutationGuard | undefined,
  resolveSetup?: (path: unknown) => { readonly isNew: boolean; readonly folderId?: string },
  views: () => readonly WebContents[] = () => []
): Pick<IpcMain, "handle"> & {
  invalidateRevision(
    userId: number,
    repositoryId: number,
    commit: string,
    excludeId?: number
  ): void;
} => {
  const active = new Set<string>();
  const readSessions = new WeakMap<
    WebContents,
    { userId: number; generation: number | undefined }
  >();
  const courseKey = (context: VerifiedCourseOperationContext) =>
    `${context.userId}:${context.repositoryId}`;
  const bindings = new Map<WebContents, Map<string, string>>();
  const changed = (origin: WebContents, folderId: string, revision?: string) => {
    for (const sender of [origin, ...views()]) {
      if (sender.isDestroyed()) {
        bindings.delete(sender);
        continue;
      }
      const loaded = bindings.get(sender)?.get(folderId);
      if (sender !== origin && loaded && loaded !== revision) {
        invalidate(sender);
        sender.send(COURSE_MUTATION_NOTICE, { status: "view_invalidated" });
      }
    }
  };
  const bind = (sender: WebContents, context: VerifiedCourseOperationContext) => {
    const previous = readSessions.get(sender);
    if (
      previous &&
      (previous.userId !== context.userId || previous.generation !== context.sessionGeneration)
    ) {
      invalidate(sender);
      sender.send(COURSE_MUTATION_NOTICE, { status: "view_invalidated" });
    } else
      readSessions.set(sender, { userId: context.userId, generation: context.sessionGeneration });
    changed(sender, courseKey(context), courseContextRevision(context));
    let courses = bindings.get(sender);
    if (!courses) {
      courses = new Map();
      bindings.set(sender, courses);
      sender.once?.("destroyed", () => bindings.delete(sender));
    }
    courses.set(courseKey(context), courseContextRevision(context));
  };
  const documents = new WeakMap<
    WebContents,
    { stale: boolean; epoch: number; revision: number; loadingRevision: number }
  >();
  const document = (sender: WebContents) => {
    let state = documents.get(sender);
    if (!state) {
      state = { stale: false, epoch: 0, revision: 0, loadingRevision: 0 };
      documents.set(sender, state);
      const captured = state;
      sender.on?.("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) captured.loadingRevision = captured.revision;
      });
      sender.on?.("did-finish-load", () => {
        // A load begun before the final worktree verification cannot make an editor current.
        captured.stale = captured.loadingRevision !== captured.revision;
        captured.epoch++;
        if (!captured.stale) {
          readSessions.delete(sender);
          bindings.get(sender)?.clear();
        }
      });
    }
    return state;
  };
  const invalidate = (sender: WebContents) => {
    const state = document(sender);
    state.stale = true;
    state.revision++;
  };
  const requireFreshView = (state: { stale: boolean; epoch: number }, epoch: number) => {
    if (state.stale || state.epoch !== epoch)
      blockMutation(
        "view_refresh_required",
        "Course source changed. Refresh/reopen this view before retrying the change.",
        "refresh_view"
      );
  };
  ipc.handle(
    IPC_CHANNELS.getCourseOperationalMode,
    (_event, folderId: unknown, ...extra: unknown[]) => {
      if (typeof folderId !== "string" || extra.length)
        throw new Error("Only registered course identity is accepted.");
      return guard()?.isManaged(folderId) ? "managed" : "legacy";
    }
  );
  ipc.handle(
    IPC_CHANNELS.cutoverManagedCourse,
    async (event, folderId: unknown, ...extra: unknown[]) => {
      if (typeof folderId !== "string" || extra.length)
        throw new Error("Only registered course identity is accepted.");
      try {
        const boundary = guard();
        if (!boundary)
          blockMutation(
            "authorization_required",
            "Authorize course access before cutover.",
            "authorization"
          );
        await boundary!.cutover(folderId);
        for (const sender of [event.sender, ...views()]) {
          if (sender.isDestroyed()) continue;
          invalidate(sender);
          sender.send(COURSE_MUTATION_NOTICE, { status: "view_invalidated" });
        }
      } catch (error) {
        if (error instanceof CourseMutationBlocked && !event.sender.isDestroyed())
          event.sender.send(COURSE_MUTATION_NOTICE, error.result);
        throw error;
      }
    }
  );
  ipc.handle(IPC_CHANNELS.reloadCourseView, (event) => {
    event.sender.reload();
  });
  ipc.handle(IPC_CHANNELS.updateCourseSource, async (event, folderId: unknown) => {
    if (typeof folderId !== "string") throw new Error("Registered course folder ID is required.");
    const boundary = guard();
    if (!boundary)
      blockMutation(
        "authorization_required",
        "Authorize course access before updating.",
        "authorization"
      );
    const affected = new Set<WebContents>();
    try {
      await boundary!.updateSource(folderId, () => {
        for (const sender of [event.sender, ...views()]) {
          if (sender.isDestroyed()) continue;
          invalidate(sender);
          affected.add(sender);
          sender.send(COURSE_MUTATION_NOTICE, { status: "view_invalidated" });
        }
      });
      for (const sender of affected)
        if (!sender.isDestroyed()) {
          invalidate(sender);
          sender.send(COURSE_MUTATION_NOTICE, { status: "source_updated" });
        }
    } catch (error) {
      for (const sender of affected)
        if (!sender.isDestroyed()) {
          invalidate(sender);
          sender.send(COURSE_MUTATION_NOTICE, { status: "view_invalidated" });
        }
      if (error instanceof CourseMutationBlocked && !event.sender.isDestroyed())
        event.sender.send(COURSE_MUTATION_NOTICE, error.result);
      throw error;
    }
  });
  return {
    invalidateRevision(userId, repositoryId, commit, excludeId) {
      const key = `${userId}:${repositoryId}`;
      for (const [sender, courses] of bindings) {
        if (sender.isDestroyed()) {
          bindings.delete(sender);
          continue;
        }
        const revision = courses.get(key);
        if (sender.id !== excludeId && revision && revision !== commit) {
          invalidate(sender);
          sender.send(COURSE_MUTATION_NOTICE, { status: "view_invalidated" });
        }
      }
    },
    handle(channel, handler) {
      ipc.handle(channel, (event, ...args: unknown[]) =>
        executeCourseOperation(event.sender.id, channel, async () => {
          const view = document(event.sender);
          const epoch = view.epoch;
          const request = args[0];
          const fields =
            typeof request === "object" && request !== null
              ? (request as Record<string, unknown>)
              : {};
          const schemaRequest = {
            channel,
            fields,
            onChanged: (_context: VerifiedCourseMutationContext) => {
              for (const sender of [event.sender, ...views()]) {
                if (!sender.isDestroyed()) {
                  invalidate(sender);
                  sender.send(COURSE_MUTATION_NOTICE, { status: "view_invalidated" });
                }
              }
            }
          };
          const setup =
            channel === IPC_CHANNELS.saveCourseSetup || channel === IPC_CHANNELS.previewCourseSetup
              ? resolveSetup?.(fields.courseFolderPath)
              : undefined;
          if (setup?.isNew) return handler(event, ...args);
          const folderId =
            setup?.folderId ??
            ((
              [
                IPC_CHANNELS.publishCourseChanges,
                IPC_CHANNELS.getCoursePublishStatus
              ] as readonly string[]
            ).includes(channel)
              ? request
              : fields.courseFolderId);
          const invoke = async (
            context?: VerifiedCourseOperationContext,
            root = context?.courseFolderPath,
            transaction = false,
            afterPublication?: Array<() => Promise<unknown>>
          ) => {
            if (!context || !root) return handler(event, ...args);
            const { expectedCourseRevision: _expected, ...domainFields } = fields;
            const projectedArgs =
              context.managed && request && typeof request === "object"
                ? [
                    {
                      ...domainFields,
                      ...(Object.hasOwn(fields, "courseFolderPath")
                        ? { courseFolderPath: root }
                        : {})
                    },
                    ...args.slice(1)
                  ]
                : args;
            const result = await managedCourseOperation.run(
              {
                ...context,
                courseFolderPath: root,
                transaction,
                authoritativePath: context.courseFolderPath,
                afterPublication
              },
              () => measureGradingPhase("service", async () => handler(event, ...projectedArgs))
            );
            if (!context.managed) return result;
            const publicResult = projectManagedCourseResult(
              result,
              root,
              context.legacyFolderPath!
            );
            return publicResult && typeof publicResult === "object" && !Array.isArray(publicResult)
              ? {
                  ...publicResult,
                  courseReadRevision: courseContextRevision(context),
                  ...(context.mode === "local_read" ||
                  context.mode === "local_grading" ||
                  context.mode === "evidence_read"
                    ? { courseReadRevisionSource: "local_cache" }
                    : {})
                }
              : publicResult;
          };
          if (!COURSE_MUTATION_CHANNELS.includes(channel)) {
            if (!folderId) return handler(event, ...args);
            const boundary = guard();
            if (!boundary) return handler(event, ...args);
            if (channel === IPC_CHANNELS.chooseReviewImport) {
              // Resolve the source before opening the native chooser, then release the lease.
              const context = await boundary.localGrading(
                folderId,
                fields.courseFolderPath,
                async (resolved) => resolved,
                schemaRequest
              );
              if (context?.managed) bind(event.sender, context);
              return reviewImportPreparation.run(
                {
                  run: (operation) =>
                    boundary.localGrading(
                      folderId,
                      fields.courseFolderPath,
                      async (current) => {
                        if (current?.courseFolderPath !== context?.courseFolderPath)
                          throw new Error("Course identity changed. Reopen Import Reviews.");
                        return current === undefined
                          ? operation()
                          : managedCourseOperation.run(current, operation);
                      },
                      schemaRequest
                    )
                },
                () => invoke(context)
              );
            }
            return boundary
              .read(
                folderId,
                fields.courseFolderPath,
                async (context) => {
                  if (context) bind(event.sender, context);
                  if (context?.managed) {
                    if (
                      EDIT_PREVIEWS.includes(channel) &&
                      (channel !== IPC_CHANNELS.previewCourseSetup ||
                        fields.expectedCourseRevision !== undefined)
                    )
                      requireReadRevision(fields.expectedCourseRevision, context);
                    bind(event.sender, context);
                    if (channel === IPC_CHANNELS.getCoursePublishStatus)
                      return {
                        status: "up_to_date",
                        courseReadRevision: courseContextRevision(context),
                        courseReadRevisionSource: "local_cache",
                        courseFolderPath: context.legacyFolderPath,
                        currentBranch: null,
                        upstreamBranch: null,
                        aheadCount: 0,
                        allowedChangedFiles: [],
                        unrelatedChangedFiles: [],
                        diagnostics: [
                          {
                            message:
                              "Managed course changes publish atomically. No pending local course changes; remote freshness has not been checked."
                          }
                        ]
                      };
                  }
                  return invoke(context);
                },
                schemaRequest
              )
              .catch((error) => {
                if (error instanceof CourseMutationBlocked && !event.sender.isDestroyed())
                  event.sender.send(COURSE_MUTATION_NOTICE, error.result);
                throw error;
              });
          }
          const notify = (value: unknown) => {
            if (!event.sender.isDestroyed()) event.sender.send(COURSE_MUTATION_NOTICE, value);
          };
          const key = `${event.sender.id}:${channel}:${String(folderId)}`;
          if (active.has(key))
            blockMutation(
              "synchronization_retry_required",
              "This course action is already running. Wait for it to finish.",
              "retry"
            );
          active.add(key);
          notify({ status: "checking" });
          try {
            requireFreshView(view, epoch);
            const boundary = guard();
            if (!boundary)
              return blockMutation(
                "authorization_required",
                "Course authorization is not ready. Retry after sign-in.",
                "authorization"
              );
            if (LOCAL_GRADING_MUTATION_CHANNELS.includes(channel))
              return await boundary.localGrading(
                folderId,
                fields.courseFolderPath,
                async (context) => {
                  requireFreshView(view, epoch);
                  const loaded = readSessions.get(event.sender);
                  if (
                    loaded &&
                    (!context ||
                      loaded.userId !== context.userId ||
                      loaded.generation !== context.sessionGeneration)
                  )
                    blockMutation(
                      "view_refresh_required",
                      "Account authorization changed since this view was loaded. Reopen it before writing.",
                      "refresh_view"
                    );
                  if (context) {
                    const revision = bindings.get(event.sender)?.get(courseKey(context));
                    if (revision && revision !== courseContextRevision(context))
                      blockMutation(
                        "view_refresh_required",
                        "Course changed. Reopen this workspace before writing.",
                        "refresh_view"
                      );
                    bind(event.sender, context);
                  }
                  return invoke(context);
                },
                schemaRequest
              );
            return await boundary.run(
              folderId,
              fields.courseFolderPath,
              channel === IPC_CHANNELS.publishCourseChanges ? "publication_retry" : "new_mutation",
              async (context, input) => {
                requireFreshView(view, epoch);
                const loadedSession = readSessions.get(event.sender);
                if (
                  loadedSession &&
                  (!context ||
                    loadedSession.userId !== context.userId ||
                    loadedSession.generation !== context.sessionGeneration)
                )
                  blockMutation(
                    "view_refresh_required",
                    "Account authorization changed since this view was loaded. Refresh the view before continuing.",
                    "refresh_view"
                  );
                if (!context?.managed) return invoke(context);
                const loadedRevision = bindings.get(event.sender)?.get(courseKey(context));
                if (loadedRevision && loadedRevision !== courseContextRevision(context))
                  blockMutation(
                    "view_refresh_required",
                    "The authoritative course changed since this workspace was loaded. Reopen it before writing.",
                    "refresh_view"
                  );
                changed(event.sender, courseKey(context), courseContextRevision(context));
                if (channel === IPC_CHANNELS.publishCourseChanges)
                  return {
                    status: "up_to_date",
                    diagnostics: [
                      {
                        message:
                          "Managed course changes publish atomically. No pending course changes."
                      }
                    ],
                    commitMessage: null
                  };
                if (COURSE_ADMIN_CHANNELS.includes(channel)) {
                  requireReadRevision(fields.expectedCourseRevision, context);
                  const afterPublication: Array<() => Promise<unknown>> = [];
                  const result = await boundary.transaction(
                    context,
                    input,
                    fields.expectedCourseRevision,
                    (file) => allowedCourseMutationPath(channel, fields, file),
                    (root) => invoke(context, root, true, afterPublication),
                    () => changed(event.sender, courseKey(context))
                  );
                  if (
                    result &&
                    typeof result === "object" &&
                    "publication" in result &&
                    (result.publication as { status?: string; refreshRequired?: boolean })
                      ?.status === "success" &&
                    !(result.publication as { refreshRequired?: boolean }).refreshRequired
                  ) {
                    const warnings: unknown[] = [];
                    for (const task of afterPublication) {
                      try {
                        const revision = (result.publication as { commit?: string }).commit;
                        await context.revalidate?.(revision);
                        const diagnostics = await managedCourseOperation.run(
                          {
                            ...context,
                            revalidate: () => context.revalidate?.(revision) ?? Promise.resolve()
                          },
                          task
                        );
                        if (Array.isArray(diagnostics)) warnings.push(...diagnostics);
                      } catch {
                        warnings.push({
                          message:
                            "Course changes published, but derived Student Repository pages need attention."
                        });
                      }
                    }
                    if (warnings.length)
                      return {
                        ...result,
                        diagnostics: [
                          ...((result as { diagnostics?: unknown[] }).diagnostics ?? []),
                          ...warnings
                        ]
                      };
                  }
                  if (
                    result &&
                    typeof result === "object" &&
                    "publication" in result &&
                    (result.publication as { refreshRequired?: boolean })?.refreshRequired
                  )
                    notify({ status: "published_refresh_required" });
                  // Originating editors refetch the successful result; sibling documents must reload.
                  return result;
                }
                bind(event.sender, context);
                return invoke(context);
              },
              schemaRequest
            );
          } catch (error) {
            if (error instanceof CourseMutationBlocked) {
              notify(error.result);
            }
            throw error;
          } finally {
            active.delete(key);
            notify({ status: "finished" });
          }
        })
      );
    }
  };
};
