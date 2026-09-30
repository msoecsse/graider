import path from "node:path";
import { createNodeProcessRunner } from "./commandRunner.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

export interface TemplateManagedWorkflowReplacementRequest {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly confirmed: boolean;
  readonly previewFingerprint?: string;
}

export type TemplateManagedWorkflowReplacementResult =
  | {
      readonly status: "ready";
      readonly preview: {
        readonly repository: { readonly fullName: string; readonly defaultBranch: string };
        readonly classification: string;
        readonly action: "create" | "no_change" | "replace" | "unavailable";
        readonly contentFingerprint: string;
      };
    }
  | {
      readonly status: "success";
      readonly result: { readonly workflow: { readonly status: string } };
    }
  | { readonly status: string };

interface Backend {
  prepareTemplateManagedWorkflowReplacement(request: {
    readonly courseFolderPath: string;
    readonly termCode: string;
    readonly assignmentSlug: string;
  }): { readonly status: string; readonly value?: unknown };
  previewPreparedTemplateManagedWorkflowReplacement(
    prepared: unknown,
    token: string
  ): Promise<TemplateManagedWorkflowReplacementResult>;
  installPreparedTemplateManagedWorkflowReplacement(
    prepared: unknown,
    token: string,
    confirmed: boolean,
    overrides?: unknown,
    expectedContentFingerprint?: string
  ): Promise<TemplateManagedWorkflowReplacementResult>;
}

const loadBackend = (): Backend =>
  (
    require(path.join(__dirname, "templateManagedWorkflowReplacementBackend.cjs")) as {
      templateManagedWorkflowReplacementBackend: Backend;
    }
  ).templateManagedWorkflowReplacementBackend;

export const replaceTemplateManagedWorkflow = async (
  request: TemplateManagedWorkflowReplacementRequest,
  overrides: {
    readonly resolveToken?: () => Promise<GithubTokenResolution>;
    readonly loadBackend?: () => Backend;
  } = {}
): Promise<TemplateManagedWorkflowReplacementResult> => {
  const backend = (overrides.loadBackend ?? loadBackend)();
  const prepared = backend.prepareTemplateManagedWorkflowReplacement({
    courseFolderPath: request.courseFolderPath,
    termCode: request.termCode,
    assignmentSlug: request.assignmentSlug
  });
  if (prepared.status !== "success" || prepared.value === undefined)
    return { status: prepared.status };
  const token = await (
    overrides.resolveToken ??
    (async () => await resolveGithubToken({ runner: createNodeProcessRunner() }))
  )();
  if (token.status === "failure") return { status: "github_auth_unavailable" };
  return request.confirmed
    ? await backend.installPreparedTemplateManagedWorkflowReplacement(
        prepared.value,
        token.token,
        true,
        {},
        request.previewFingerprint
      )
    : await backend.previewPreparedTemplateManagedWorkflowReplacement(prepared.value, token.token);
};
