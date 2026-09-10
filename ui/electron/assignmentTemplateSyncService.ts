import path from "node:path";
import type { AssignmentDetailRequest } from "./ipc.js";
import type { ProcessRunner } from "./commandRunner.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

export type AssignmentTemplateSyncRequest = AssignmentDetailRequest;
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
  readonly blocker?: TemplateSyncBlocker;
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

// Declared as function-typed properties, not methods: neither one uses `this`, callers pass
// them around detached, and property syntax also checks their parameters contravariantly.
export interface AssignmentTemplateSyncService {
  readonly prepare: (
    request: AssignmentTemplateSyncRequest
  ) => Promise<AssignmentTemplateSyncAvailability>;
  readonly execute: (
    request: AssignmentTemplateSyncExecuteRequest
  ) => Promise<AssignmentTemplateSyncExecutionResult>;
}

interface AssignmentTemplateSyncBackend extends Omit<AssignmentTemplateSyncService, "execute"> {
  readonly execute: (
    request: AssignmentTemplateSyncExecuteRequest & { readonly resolvedGithubToken?: string }
  ) => Promise<AssignmentTemplateSyncExecutionResult>;
}

type ResolveGithubToken = () => Promise<GithubTokenResolution>;

// The core backend is bundled alongside Electron to preserve its existing CJS layout, and this
// module is itself emitted as CommonJS, so `require` is the correct loader here.
const loadBackend = (): AssignmentTemplateSyncBackend => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see note above
  const backendModule = require(path.join(__dirname, "assignmentTemplateSyncBackend.cjs")) as {
    assignmentTemplateSyncContextService: AssignmentTemplateSyncBackend;
  };

  return backendModule.assignmentTemplateSyncContextService;
};

export const createAssignmentTemplateSyncService = (
  backend: () => AssignmentTemplateSyncBackend,
  resolveToken: ResolveGithubToken
): AssignmentTemplateSyncService => ({
  prepare: async (request) => backend().prepare(request),
  execute: async (request) => {
    if (!request.confirmed) return await backend().execute(request);

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

    return await backend().execute({
      ...request,
      resolvedGithubToken: tokenResolution.token
    });
  }
});

/**
 * Builds the service against a caller-supplied runner. The runner carries the Graider CLI
 * resolution options, so sharing the one the app already built keeps a single resolution path
 * instead of a second, unconfigured one that would fall back to a bare PATH lookup.
 */
export const createAssignmentTemplateSyncServiceWithRunner = (
  runner: ProcessRunner
): AssignmentTemplateSyncService =>
  createAssignmentTemplateSyncService(
    loadBackend,
    async () => await resolveGithubToken({ runner })
  );
