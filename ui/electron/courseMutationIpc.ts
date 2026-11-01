import {
  managedCourseOperation,
  courseOperationDocument
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
import { COURSE_MUTATION_NOTICE } from "./managedCourseMutationTypes.js";

/** Explicit inventory: all handlers are wrapped before their first local/remote write. */
export const COURSE_MUTATION_CHANNELS: readonly string[] = [
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
  const courseKey = (context: VerifiedCourseMutationContext) =>
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
  const bind = (sender: WebContents, context: VerifiedCourseMutationContext) => {
    const previous = readSessions.get(sender);
    if (
      previous &&
      (previous.userId !== context.userId || previous.generation !== context.sessionGeneration)
    ) {
      invalidate(sender);
      sender.send(COURSE_MUTATION_NOTICE, { status: "view_invalidated" });
    } else
      readSessions.set(sender, { userId: context.userId, generation: context.sessionGeneration });
    changed(sender, courseKey(context), context.authoritativeCommit);
    let courses = bindings.get(sender);
    if (!courses) {
      courses = new Map();
      bindings.set(sender, courses);
      sender.once?.("destroyed", () => bindings.delete(sender));
    }
    courses.set(courseKey(context), context.authoritativeCommit);
  };
  // Results retain compatibility identities; temporary/managed roots never become renderer selectors.
  const projectResult = (value: unknown, root: string, legacy: string): unknown => {
    if (typeof value === "string") return value.replaceAll(root, legacy);
    if (Array.isArray(value)) return value.map((item) => projectResult(item, root, legacy));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, projectResult(item, root, legacy)])
      );
    return value;
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
        courseOperationDocument.run(event.sender.id, async () => {
          const view = document(event.sender);
          const epoch = view.epoch;
          const request = args[0];
          const fields =
            typeof request === "object" && request !== null
              ? (request as Record<string, unknown>)
              : {};
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
            context?: VerifiedCourseMutationContext,
            root = context?.courseFolderPath,
            transaction = false,
            afterPublication?: Array<() => Promise<unknown>>
          ) => {
            if (!context?.managed || !root) return handler(event, ...args);
            const { expectedCourseRevision: _expected, ...domainFields } = fields;
            const projectedArgs =
              request && typeof request === "object"
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
              () => handler(event, ...projectedArgs)
            );
            const publicResult = projectResult(result, root, context.legacyFolderPath!);
            return publicResult && typeof publicResult === "object" && !Array.isArray(publicResult)
              ? { ...publicResult, courseReadRevision: context.authoritativeCommit }
              : publicResult;
          };
          if (!COURSE_MUTATION_CHANNELS.includes(channel)) {
            if (!folderId) return handler(event, ...args);
            const boundary = guard();
            if (!boundary) return handler(event, ...args);
            if (channel === IPC_CHANNELS.chooseReviewImport) {
              // Resolve the source before opening the native chooser, then release the lease.
              const context = await boundary.read(
                folderId,
                fields.courseFolderPath,
                async (resolved) => resolved
              );
              if (context?.managed) bind(event.sender, context);
              return invoke(context);
            }
            return boundary
              .read(folderId, fields.courseFolderPath, async (context) => {
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
                      courseFolderPath: context.legacyFolderPath,
                      currentBranch: null,
                      upstreamBranch: null,
                      aheadCount: 0,
                      allowedChangedFiles: [],
                      unrelatedChangedFiles: [],
                      diagnostics: [
                        {
                          message:
                            "Managed course changes publish atomically. No pending course changes."
                        }
                      ]
                    };
                }
                return invoke(context);
              })
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
                if (!context?.managed) return handler(event, ...args);
                changed(event.sender, courseKey(context), context.authoritativeCommit);
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
                        const diagnostics = await task();
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
              }
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
