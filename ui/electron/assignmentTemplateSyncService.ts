import path from "node:path";
import type { AssignmentDetailRequest } from "./ipc.js";
import { createNodeProcessRunner } from "./commandRunner.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

export interface AssignmentTemplateSyncRequest extends AssignmentDetailRequest {
  /** Narrow selector only; repository identity remains manifest-resolved in the main process. */
  readonly studentId?: string;
}
export interface AssignmentTemplateSyncExecuteRequest extends AssignmentTemplateSyncRequest {
  readonly confirmed: boolean;
}

export interface TemplateSyncBlocker {
  readonly code: string;
  readonly message: string;
}

export interface AssignmentTemplateSyncAvailability {
  readonly available: boolean;
  readonly repositoryCount: number;
  readonly templateRepository: string | null;
  /** Recorded revision, not a claim about the current remote HEAD. */
  readonly recordedTemplateRevision: string | null;
  /** Trusted preview identity for a single-student confirmation dialog. */
  readonly selectedRepository?: { readonly studentId: string; readonly repository: string };
  readonly blocker?: TemplateSyncBlocker;
}

/** Projected repository heartbeat sent from trusted main-process sync state. */
export interface AssignmentTemplateSyncProgress {
  readonly current: number;
  readonly total: number;
  readonly studentId: string;
  readonly repository: string;
}

export type AssignmentTemplateSyncFailureStage =
  | "template_clone_failed"
  | "student_clone_failed"
  | "template_checkout_failed"
  | "student_checkout_failed"
  | "patch_failed"
  | "commit_failed"
  | "push_failed"
  | "github_api_failed"
  | "permission_denied"
  | "invalid_repository";

export interface AssignmentTemplateSyncOutcome {
  readonly studentId: string;
  readonly status:
    | "updated"
    | "already_current"
    | "pull_request_created"
    | "pull_request_pending"
    | "baseline_required"
    | "failed"
    | "pull_request_closed";
  readonly pullRequest?: { readonly number: number; readonly url: string };
  readonly failureStage?: AssignmentTemplateSyncFailureStage;
  readonly message?: string;
}

export interface AssignmentTemplateSyncExecutionResult {
  readonly status: "success" | "partial_success" | "failure";
  readonly outcomes: readonly AssignmentTemplateSyncOutcome[];
  readonly blocker?: TemplateSyncBlocker;
}

export interface AssignmentTemplateSyncService {
  prepare(request: AssignmentTemplateSyncRequest): Promise<AssignmentTemplateSyncAvailability>;
  execute(
    request: AssignmentTemplateSyncExecuteRequest,
    onProgress?: (progress: AssignmentTemplateSyncProgress) => void
  ): Promise<AssignmentTemplateSyncExecutionResult>;
}

interface AssignmentTemplateSyncBackend extends Omit<AssignmentTemplateSyncService, "execute"> {
  execute(
    request: AssignmentTemplateSyncExecuteRequest & { readonly resolvedGithubToken?: string },
    onProgress?: (progress: AssignmentTemplateSyncProgress) => void
  ): Promise<AssignmentTemplateSyncExecutionResult>;
}

type ResolveGithubToken = () => Promise<GithubTokenResolution>;

// The core backend is bundled alongside Electron to preserve its existing CJS layout.
const loadBackend = (): AssignmentTemplateSyncBackend =>
  (
    require(path.join(__dirname, "assignmentTemplateSyncBackend.cjs")) as {
      assignmentTemplateSyncContextService: AssignmentTemplateSyncBackend;
    }
  ).assignmentTemplateSyncContextService;

export const createAssignmentTemplateSyncService = (
  backend: () => AssignmentTemplateSyncBackend = loadBackend,
  resolveToken: ResolveGithubToken = async () =>
    await resolveGithubToken({ runner: createNodeProcessRunner() })
): AssignmentTemplateSyncService => ({
  prepare: async (request) => backend().prepare(request),
  execute: async (request, onProgress) => {
    if (!request.confirmed) return await backend().execute(request, onProgress);

    const tokenResolution = await resolveToken();
    if (tokenResolution.status === "failure") {
      return {
        status: "failure",
        outcomes: [],
        blocker: {
          code: "github_token_required",
          message: tokenResolution.error.message
        }
      };
    }

    const executionRequest = {
      ...request,
      resolvedGithubToken: tokenResolution.token
    };
    return onProgress === undefined
      ? await backend().execute(executionRequest)
      : await backend().execute(executionRequest, onProgress);
  }
});

export const assignmentTemplateSyncService = createAssignmentTemplateSyncService();
