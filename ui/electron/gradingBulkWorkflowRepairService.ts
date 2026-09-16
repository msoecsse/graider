import path from "node:path";
import {
  resolveCurrentFacultyScope,
  type FacultyScopeServiceRequest,
  type FacultyScopeServiceResult
} from "./facultyScopeService.js";
import { createNodeProcessRunner } from "./commandRunner.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";
import {
  getLocalRepositoryLocatorPath,
  resolveLocalStudentRepository,
  type LocalRepositoryResolution
} from "./localRepositoryLocator.js";
import { readLocalRepositoryHead, type LocalRepositoryHeadResult } from "./localRepositoryHead.js";

export interface GradingBulkWorkflowRepairRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly confirmed: boolean;
}

type RepositoryResult = {
  readonly studentIds: readonly string[];
  readonly repository?: string;
  readonly status: "success" | "failed";
  readonly workflowStatus?: string;
  readonly dispatchStatus?: string;
  readonly message?: string;
};

export type GradingBulkWorkflowRepairResult =
  | { readonly status: "unconfirmed"; readonly studentIds: readonly string[] }
  | { readonly status: Exclude<FacultyScopeServiceResult["status"], "success"> }
  | { readonly status: "github_auth_unavailable" }
  | {
      readonly status: "success";
      readonly studentIds: readonly string[];
      readonly repositoryResults: readonly RepositoryResult[];
      readonly counts: {
        readonly total: number;
        readonly succeeded: number;
        readonly failed: number;
        readonly createdOrReplaced: number;
        readonly alreadyCurrent: number;
        readonly dispatched: number;
        readonly dispatchFailed: number;
      };
    };

interface Backend {
  prepareGradingStudentWorkflowRepairContext(request: {
    readonly courseFolderPath: string;
    readonly termCode: string;
    readonly assignmentSlug: string;
    readonly studentId: string;
    readonly currentSubmissionCommitSha?: string;
  }): PrepareResult;
  executePreparedGradingStudentWorkflowRepair(
    prepared: PreparedContext,
    token: string,
    confirmed: boolean
  ): Promise<ExecuteResult>;
}

interface PreparedContext {
  readonly studentId: string;
  readonly repository: { readonly owner: string; readonly name: string };
  readonly grading: unknown;
  readonly submissionCommitSha: string;
}
type PrepareResult =
  | { readonly status: "success"; readonly value: PreparedContext }
  | { readonly status: string; readonly studentId: string; readonly value?: undefined };
type ExecuteResult =
  | {
      readonly status: "success";
      readonly result: {
        readonly workflow: { readonly status: string };
        readonly dispatch: { readonly status: string };
        readonly diagnostics: readonly { readonly message: string }[];
      };
    }
  | { readonly status: string; readonly result?: undefined };

const loadBackend = (): Backend =>
  (
    require(path.join(__dirname, "gradingStudentWorkflowRepairBackend.cjs")) as {
      gradingStudentWorkflowRepairBackend: Backend;
    }
  ).gradingStudentWorkflowRepairBackend;

export const repairGradingWorkflowsForAssignment = async (
  request: GradingBulkWorkflowRepairRequest,
  dependencies: {
    readonly resolveFacultyScope?: (
      request: FacultyScopeServiceRequest
    ) => FacultyScopeServiceResult;
    readonly resolveToken?: () => Promise<GithubTokenResolution>;
    readonly loadBackend?: () => Backend;
    readonly resolveLocalRepository?: (
      file: string,
      key: {
        readonly courseFolderId: string;
        readonly termCode: string;
        readonly assignmentSlug: string;
        readonly studentId: string;
      }
    ) => LocalRepositoryResolution;
    readonly readLocalHead?: (repositoryRoot: string) => Promise<LocalRepositoryHeadResult>;
  } = {}
): Promise<GradingBulkWorkflowRepairResult> => {
  const scope = (dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope)(request);
  if (scope.status !== "success") return { status: scope.status };
  const studentIds = scope.students.map((student) => student.studentId);
  if (!request.confirmed) return { status: "unconfirmed", studentIds };
  const token = await (
    dependencies.resolveToken ??
    (async () => await resolveGithubToken({ runner: createNodeProcessRunner() }))
  )();
  if (token.status === "failure") return { status: "github_auth_unavailable" };
  const backend = (dependencies.loadBackend ?? loadBackend)();
  const resolveLocalRepository =
    dependencies.resolveLocalRepository ?? resolveLocalStudentRepository;
  const readLocalHead = dependencies.readLocalHead ?? readLocalRepositoryHead;
  const byRepository = new Map<string, { prepared: PreparedContext; studentIds: string[] }>();
  const results: RepositoryResult[] = [];
  for (const studentId of studentIds) {
    let prepared = backend.prepareGradingStudentWorkflowRepairContext({ ...request, studentId });
    if (prepared.status === "submission_commit_unavailable") {
      const localRepository = resolveLocalRepository(
        getLocalRepositoryLocatorPath(request.userDataPath),
        {
          courseFolderId: request.courseFolderId,
          termCode: request.termCode,
          assignmentSlug: request.assignmentSlug,
          studentId
        }
      );
      if (localRepository.status !== "success") {
        results.push({
          studentIds: [studentId],
          status: "failed",
          message: localRepository.status
        });
        continue;
      }
      const head = await readLocalHead(localRepository.localPath);
      if (head.status !== "success") {
        results.push({ studentIds: [studentId], status: "failed", message: head.status });
        continue;
      }
      prepared = backend.prepareGradingStudentWorkflowRepairContext({
        ...request,
        studentId,
        currentSubmissionCommitSha: head.submissionCommitSha
      });
    }
    if (prepared.status !== "success" || prepared.value === undefined) {
      results.push({ studentIds: [studentId], status: "failed", message: prepared.status });
      continue;
    }
    const value = prepared.value;
    const repository = `${value.repository.owner}/${value.repository.name}`;
    const target = byRepository.get(repository);
    if (target === undefined)
      byRepository.set(repository, { prepared: value, studentIds: [studentId] });
    else target.studentIds.push(studentId);
  }
  for (const [repository, target] of byRepository) {
    const outcome = await backend.executePreparedGradingStudentWorkflowRepair(
      target.prepared,
      token.token,
      true
    );
    if (outcome.status !== "success" || outcome.result === undefined) {
      results.push({
        studentIds: target.studentIds,
        repository,
        status: "failed",
        message: outcome.status
      });
      continue;
    }
    const operation = outcome.result;
    const dispatchStatus = operation.dispatch.status;
    results.push({
      studentIds: target.studentIds,
      repository,
      status: dispatchStatus === "dispatched" ? "success" : "failed",
      workflowStatus: operation.workflow.status,
      dispatchStatus,
      ...(operation.diagnostics[0]?.message === undefined
        ? {}
        : { message: operation.diagnostics[0].message })
    });
  }
  const succeeded = results.filter((result) => result.status === "success").length;
  const createdOrReplaced = results.filter(
    (result) =>
      result.workflowStatus?.startsWith("created") || result.workflowStatus?.startsWith("replaced")
  ).length;
  const alreadyCurrent = results.filter(
    (result) => result.workflowStatus === "already_current"
  ).length;
  const dispatched = results.filter((result) => result.dispatchStatus === "dispatched").length;
  const dispatchFailed = results.filter((result) => result.dispatchStatus === "failed").length;
  return {
    status: "success",
    studentIds,
    repositoryResults: results,
    counts: {
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      createdOrReplaced,
      alreadyCurrent,
      dispatched,
      dispatchFailed
    }
  };
};
