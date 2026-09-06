import path from "node:path";
import type { AssignmentDetailRequest } from "./ipc.js";

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
    request: AssignmentTemplateSyncExecuteRequest
  ): Promise<AssignmentTemplateSyncExecutionResult>;
}

// The core backend is bundled alongside Electron to preserve its existing CJS layout.
const loadBackend = (): AssignmentTemplateSyncService =>
  (
    require(path.join(__dirname, "assignmentTemplateSyncBackend.cjs")) as {
      assignmentTemplateSyncContextService: AssignmentTemplateSyncService;
    }
  ).assignmentTemplateSyncContextService;

export const createAssignmentTemplateSyncService = (
  backend: () => AssignmentTemplateSyncService = loadBackend
): AssignmentTemplateSyncService => ({
  prepare: async (request) => backend().prepare(request),
  execute: async (request) => backend().execute(request)
});

export const assignmentTemplateSyncService = createAssignmentTemplateSyncService();
