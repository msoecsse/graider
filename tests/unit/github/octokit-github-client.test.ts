import { describe, expect, it } from "vitest";
import {
  OctokitGitHubClient,
  type OctokitRestClientLike
} from "../../../src/github/octokit-github-client.js";
import { createGitHubClient, readGitHubToken } from "../../../src/github/github-client-factory.js";
import { DiagnosticCode } from "../../../src/diagnostics/error-catalog.js";

enum OctokitTestNumber {
  UserId = 101,
  RepositoryId = 202,
  TeamId = 303,
  WorkflowId = 405,
  WorkflowRunId = 505,
  ArtifactId = 606,
  EmptyBufferLength = 0,
  CreatedStatus = 201,
  NotFoundStatus = 404,
  UnauthorizedStatus = 401,
  ForbiddenStatus = 403,
  ServerErrorStatus = 500
}

const TOKEN = "ghp_testtoken1234567890";
const OWNER = "example-org";
const REPO = "example-repo";
const TEMPLATE_REPO = "template-repo";
const USERNAME = "seanjones";
const TEAM_SLUG = "faculty";
const WORKFLOW_PATH = "grade.yml";
const BRANCH = "main";
const CONTENT_PATH = "grading/report.md";
const FILE_CONTENT = "student report";
const EXISTING_SHA = "existing-sha";
const CREATED_SHA = "created-sha";
const RETRY_AFTER_SECONDS = "12";

interface RequestLikeErrorOptions {
  status?: number;
  message?: string;
  headers?: Record<string, string>;
}

const createRequestError = ({
  status,
  message = "GitHub request failed.",
  headers = {}
}: RequestLikeErrorOptions) =>
  Object.assign(new Error(message), {
    ...(status === undefined ? {} : { status }),
    response: {
      headers
    }
  });

const resolvedResponse = (data: unknown, status?: number) =>
  Promise.resolve({
    data,
    ...(status === undefined ? {} : { status })
  });

const rejectedResponse = (error: Error): Promise<never> => Promise.reject(error);

const createRepositoryResponse = () =>
  resolvedResponse({
    owner: { login: OWNER },
    name: REPO,
    full_name: `${OWNER}/${REPO}`,
    id: OctokitTestNumber.RepositoryId,
    private: true,
    archived: false,
    default_branch: BRANCH,
    html_url: `https://github.com/${OWNER}/${REPO}`,
    is_template: false
  });

const createMockOctokit = (): OctokitRestClientLike => ({
  rest: {
    users: {
      getAuthenticated: () => resolvedResponse({ login: USERNAME, id: OctokitTestNumber.UserId }),
      getByUsername: () => resolvedResponse({ login: USERNAME, id: OctokitTestNumber.UserId })
    },
    repos: {
      get: () => createRepositoryResponse(),
      createUsingTemplate: () => createRepositoryResponse(),
      listBranches: () => resolvedResponse([{ name: BRANCH }]),
      listCollaborators: () => resolvedResponse([{ login: USERNAME, permissions: { push: true } }]),
      listCommits: () => resolvedResponse([{ sha: "latest-sha" }]),
      getContent: () =>
        resolvedResponse({
          type: "file",
          sha: EXISTING_SHA,
          content: "",
          encoding: "base64"
        }),
      getCollaboratorPermissionLevel: () => resolvedResponse({ permission: "push" }),
      addCollaborator: () => resolvedResponse({}, OctokitTestNumber.CreatedStatus),
      removeCollaborator: () => resolvedResponse({}),
      update: () => resolvedResponse({}),
      createOrUpdateFileContents: () =>
        resolvedResponse({ commit: { sha: CREATED_SHA }, content: { path: CONTENT_PATH } })
    },
    teams: {
      getByName: () =>
        resolvedResponse({ id: OctokitTestNumber.TeamId, slug: TEAM_SLUG, name: TEAM_SLUG }),
      checkPermissionsForRepoInOrg: () => resolvedResponse({ permission: "admin" }),
      addOrUpdateRepoPermissionsInOrg: () => resolvedResponse({})
    },
    actions: {
      getGithubActionsPermissionsRepository: () => resolvedResponse({ enabled: true }),
      setGithubActionsPermissionsRepository: () => resolvedResponse({}),
      getWorkflow: () =>
        resolvedResponse({
          id: OctokitTestNumber.WorkflowId,
          path: WORKFLOW_PATH,
          name: "Grade",
          state: "active"
        }),
      createWorkflowDispatch: () => resolvedResponse({}),
      listWorkflowRuns: () =>
        resolvedResponse({
          workflow_runs: [
            {
              id: OctokitTestNumber.WorkflowRunId,
              path: WORKFLOW_PATH,
              status: "completed",
              conclusion: "success",
              head_sha: "head-sha",
              created_at: "2026-09-01T00:00:00Z",
              updated_at: "2026-09-01T00:01:00Z"
            }
          ]
        }),
      listWorkflowRunsForRepo: () => resolvedResponse({ workflow_runs: [] }),
      listWorkflowRunArtifacts: () =>
        resolvedResponse({
          artifacts: [
            {
              id: OctokitTestNumber.ArtifactId,
              name: "grading-results"
            }
          ]
        }),
      downloadArtifact: () => resolvedResponse(new ArrayBuffer(OctokitTestNumber.EmptyBufferLength))
    }
  },
  paginate: () => Promise.resolve([{ name: BRANCH }]),
  request: () => resolvedResponse([])
});

const expectGitHubError = async (
  action: () => Promise<unknown>,
  diagnosticCode: string
): Promise<void> => {
  await expect(action()).rejects.toMatchObject({
    diagnosticCode
  });
};

describe("OctokitGitHubClient", () => {
  it("maps authenticated user response", async () => {
    const client = new OctokitGitHubClient({ token: TOKEN, octokit: createMockOctokit() });

    await expect(client.getAuthenticatedUser()).resolves.toEqual({
      username: USERNAME,
      id: OctokitTestNumber.UserId
    });
  });

  it("missing token maps to github_auth_missing", async () => {
    const client = new OctokitGitHubClient({ octokit: createMockOctokit() });

    await expectGitHubError(() => client.getAuthenticatedUser(), DiagnosticCode.GithubAuthMissing);
  });

  it("factory reads GRAIDER_GITHUB_TOKEN before GITHUB_TOKEN", () => {
    const token = readGitHubToken({
      GRAIDER_GITHUB_TOKEN: "graider-token",
      GITHUB_TOKEN: "github-token"
    });

    expect(token).toBe("graider-token");
    expect(createGitHubClient({ token: TOKEN })).toBeInstanceOf(OctokitGitHubClient);
  });

  it("invalid token maps to github_auth_failed", async () => {
    const octokit = createMockOctokit();
    octokit.rest.users.getAuthenticated = () =>
      rejectedResponse(createRequestError({ status: OctokitTestNumber.UnauthorizedStatus }));
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expectGitHubError(() => client.getAuthenticatedUser(), DiagnosticCode.GithubAuthFailed);
  });

  it("permission denied maps to github_permission_denied", async () => {
    const octokit = createMockOctokit();
    octokit.rest.repos.createUsingTemplate = () =>
      rejectedResponse(createRequestError({ status: OctokitTestNumber.ForbiddenStatus }));
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expectGitHubError(
      () =>
        client.createRepositoryFromTemplate({
          templateOwner: OWNER,
          templateRepo: TEMPLATE_REPO,
          owner: OWNER,
          name: REPO,
          private: true
        }),
      DiagnosticCode.GithubPermissionDenied
    );
  });

  it("rate-limit response maps to github_rate_limited and preserves retry-after", async () => {
    const octokit = createMockOctokit();
    octokit.rest.repos.get = () =>
      rejectedResponse(
        createRequestError({
          status: OctokitTestNumber.ForbiddenStatus,
          headers: {
            "x-ratelimit-remaining": "0",
            "retry-after": RETRY_AFTER_SECONDS
          }
        })
      );
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expect(client.getRepository(OWNER, REPO)).rejects.toMatchObject({
      diagnosticCode: DiagnosticCode.GithubRateLimited,
      retryAfterSeconds: Number(RETRY_AFTER_SECONDS)
    });
  });

  it("5xx maps to github_api_error", async () => {
    const octokit = createMockOctokit();
    octokit.rest.repos.get = () =>
      rejectedResponse(createRequestError({ status: OctokitTestNumber.ServerErrorStatus }));
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expectGitHubError(() => client.getRepository(OWNER, REPO), DiagnosticCode.GithubApiError);
  });

  it("network failure maps to github_network_error", async () => {
    const octokit = createMockOctokit();
    octokit.rest.repos.get = () => rejectedResponse(new TypeError("fetch failed"));
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expectGitHubError(
      () => client.getRepository(OWNER, REPO),
      DiagnosticCode.GithubNetworkError
    );
  });

  it("nullable read methods return null on 404", async () => {
    const octokit = createMockOctokit();
    octokit.rest.repos.get = () =>
      rejectedResponse(createRequestError({ status: OctokitTestNumber.NotFoundStatus }));
    octokit.rest.users.getByUsername = () =>
      rejectedResponse(createRequestError({ status: OctokitTestNumber.NotFoundStatus }));
    octokit.rest.teams.getByName = () =>
      rejectedResponse(createRequestError({ status: OctokitTestNumber.NotFoundStatus }));
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expect(client.getRepository(OWNER, REPO)).resolves.toBeNull();
    await expect(client.getUser(USERNAME)).resolves.toBeNull();
    await expect(client.getTeam(OWNER, TEAM_SLUG)).resolves.toBeNull();
  });

  it("writeRepositoryFile base64 encodes content and includes existing SHA", async () => {
    const octokit = createMockOctokit();
    let observedContent = "";
    let observedSha: string | undefined;
    octokit.rest.repos.createOrUpdateFileContents = (input = {}) => {
      observedContent = String(input.content);
      observedSha = typeof input.sha === "string" ? input.sha : undefined;

      return resolvedResponse({ commit: { sha: CREATED_SHA }, content: { path: CONTENT_PATH } });
    };
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    const result = await client.writeRepositoryFile({
      owner: OWNER,
      repo: REPO,
      path: CONTENT_PATH,
      content: FILE_CONTENT,
      message: "Update report"
    });

    expect(Buffer.from(observedContent, "base64").toString("utf8")).toBe(FILE_CONTENT);
    expect(observedSha).toBe(EXISTING_SHA);
    expect(result).toEqual({ path: CONTENT_PATH, commitSha: CREATED_SHA });
  });

  it("dispatchWorkflow calls the workflow dispatch endpoint", async () => {
    const octokit = createMockOctokit();
    let observedWorkflowPath = "";
    octokit.rest.actions.createWorkflowDispatch = (input = {}) => {
      observedWorkflowPath = String(input.workflow_id);

      return resolvedResponse({});
    };
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await client.dispatchWorkflow({
      owner: OWNER,
      repo: REPO,
      workflowPath: WORKFLOW_PATH,
      ref: BRANCH
    });

    expect(observedWorkflowPath).toBe(WORKFLOW_PATH);
  });

  it("artifact missing returns null", async () => {
    const octokit = createMockOctokit();
    octokit.rest.actions.listWorkflowRunArtifacts = () => resolvedResponse({ artifacts: [] });
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expect(
      client.downloadArtifact({
        owner: OWNER,
        repo: REPO,
        runId: OctokitTestNumber.WorkflowRunId,
        artifactName: "grading-results"
      })
    ).resolves.toBeNull();
  });
});
