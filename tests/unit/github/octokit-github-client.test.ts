import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { deflateRawSync } from "node:zlib";
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
  RedirectStatus = 302,
  EmptyBufferLength = 0,
  CreatedStatus = 201,
  NotFoundStatus = 404,
  UnauthorizedStatus = 401,
  ForbiddenStatus = 403,
  ServerErrorStatus = 500,
  BadGatewayStatus = 502,
  ServiceUnavailableStatus = 503,
  GatewayTimeoutStatus = 504
}

const TOKEN = "ghp_testtoken1234567890";
const OWNER = "example-org";
const REPO = "example-repo";
const TEMPLATE_REPO = "template-repo";
const USERNAME = "seanjones";
const TEAM_SLUG = "faculty";
const WORKFLOW_PATH = "grade.yml";
const TEMPLATE_WORKFLOW_PATH = ".github/workflows/grade.yml";
const BRANCH = "main";
const CONTENT_PATH = "grading/report.md";
const FILE_CONTENT = "student report";
const WORKFLOW_CONTENT = "name: Grade\non:\n  - workflow_dispatch\n";
const EXISTING_SHA = "existing-sha";
const CREATED_SHA = "created-sha";
const RETRY_AFTER_SECONDS = "12";
const ARTIFACT_DOWNLOAD_URL = "https://artifact.example/download.zip";
const GRADING_RESULTS_PATH = "grading-results.json";
const GRADING_RESULTS_TEXT = JSON.stringify({
  schema_version: 1,
  status: "passed",
  checks: []
});
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP_VERSION = 20;
const ZIP_GENERAL_PURPOSE_DATA_DESCRIPTOR_FLAG = 0x08;
const ZIP_DEFLATE_COMPRESSION = 8;
const ZIP_MINIMUM_LOCAL_FILE_HEADER_BYTES = 30;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_BYTES = 46;
const ZIP_END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const ZIP_DATA_DESCRIPTOR_BYTES = 16;
const ZIP_EMPTY_FIELD_LENGTH = 0;
const ZIP_EMPTY_CRC32 = 0;
const ZIP_FIRST_DISK = 0;
const ZIP_SINGLE_ENTRY_COUNT = 1;
const ZIP_NO_EXTERNAL_ATTRIBUTES = 0;
const ZIP_NO_INTERNAL_ATTRIBUTES = 0;
const ZIP_LOCAL_HEADER_OFFSET = 0;
const ZIP_VERSION_NEEDED_OFFSET = 4;
const ZIP_GENERAL_PURPOSE_FLAG_OFFSET = 6;
const ZIP_COMPRESSION_METHOD_OFFSET = 8;
const ZIP_LAST_MODIFIED_TIME_OFFSET = 10;
const ZIP_LAST_MODIFIED_DATE_OFFSET = 12;
const ZIP_CRC32_OFFSET = 14;
const ZIP_COMPRESSED_SIZE_OFFSET = 18;
const ZIP_UNCOMPRESSED_SIZE_OFFSET = 22;
const ZIP_FILE_NAME_LENGTH_OFFSET = 26;
const ZIP_EXTRA_FIELD_LENGTH_OFFSET = 28;
const ZIP_DATA_DESCRIPTOR_CRC32_OFFSET = 4;
const ZIP_DATA_DESCRIPTOR_COMPRESSED_SIZE_OFFSET = 8;
const ZIP_DATA_DESCRIPTOR_UNCOMPRESSED_SIZE_OFFSET = 12;
const ZIP_CENTRAL_VERSION_MADE_BY_OFFSET = 4;
const ZIP_CENTRAL_VERSION_NEEDED_OFFSET = 6;
const ZIP_CENTRAL_GENERAL_PURPOSE_FLAG_OFFSET = 8;
const ZIP_CENTRAL_COMPRESSION_METHOD_OFFSET = 10;
const ZIP_CENTRAL_LAST_MODIFIED_TIME_OFFSET = 12;
const ZIP_CENTRAL_LAST_MODIFIED_DATE_OFFSET = 14;
const ZIP_CENTRAL_CRC32_OFFSET = 16;
const ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET = 20;
const ZIP_CENTRAL_UNCOMPRESSED_SIZE_OFFSET = 24;
const ZIP_CENTRAL_FILE_NAME_LENGTH_OFFSET = 28;
const ZIP_CENTRAL_EXTRA_FIELD_LENGTH_OFFSET = 30;
const ZIP_CENTRAL_FILE_COMMENT_LENGTH_OFFSET = 32;
const ZIP_CENTRAL_DISK_START_OFFSET = 34;
const ZIP_CENTRAL_INTERNAL_ATTRIBUTES_OFFSET = 36;
const ZIP_CENTRAL_EXTERNAL_ATTRIBUTES_OFFSET = 38;
const ZIP_CENTRAL_LOCAL_HEADER_OFFSET = 42;
const ZIP_END_CENTRAL_DIRECTORY_DISK_OFFSET = 4;
const ZIP_END_CENTRAL_DIRECTORY_START_DISK_OFFSET = 6;
const ZIP_END_CENTRAL_DIRECTORY_DISK_ENTRIES_OFFSET = 8;
const ZIP_END_CENTRAL_DIRECTORY_TOTAL_ENTRIES_OFFSET = 10;
const ZIP_END_CENTRAL_DIRECTORY_SIZE_OFFSET = 12;
const ZIP_END_CENTRAL_DIRECTORY_OFFSET = 16;
const ZIP_END_CENTRAL_DIRECTORY_COMMENT_LENGTH_OFFSET = 20;

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

const writeZipFileHeader = (
  buffer: Buffer,
  fileName: Buffer,
  compressed: Buffer,
  uncompressed: Buffer
): void => {
  buffer.writeUInt32LE(ZIP_LOCAL_FILE_HEADER_SIGNATURE);
  buffer.writeUInt16LE(ZIP_VERSION, ZIP_VERSION_NEEDED_OFFSET);
  buffer.writeUInt16LE(ZIP_GENERAL_PURPOSE_DATA_DESCRIPTOR_FLAG, ZIP_GENERAL_PURPOSE_FLAG_OFFSET);
  buffer.writeUInt16LE(ZIP_DEFLATE_COMPRESSION, ZIP_COMPRESSION_METHOD_OFFSET);
  buffer.writeUInt16LE(ZIP_EMPTY_FIELD_LENGTH, ZIP_LAST_MODIFIED_TIME_OFFSET);
  buffer.writeUInt16LE(ZIP_EMPTY_FIELD_LENGTH, ZIP_LAST_MODIFIED_DATE_OFFSET);
  buffer.writeUInt32LE(ZIP_EMPTY_CRC32, ZIP_CRC32_OFFSET);
  buffer.writeUInt32LE(ZIP_EMPTY_FIELD_LENGTH, ZIP_COMPRESSED_SIZE_OFFSET);
  buffer.writeUInt32LE(ZIP_EMPTY_FIELD_LENGTH, ZIP_UNCOMPRESSED_SIZE_OFFSET);
  buffer.writeUInt16LE(fileName.length, ZIP_FILE_NAME_LENGTH_OFFSET);
  buffer.writeUInt16LE(ZIP_EMPTY_FIELD_LENGTH, ZIP_EXTRA_FIELD_LENGTH_OFFSET);
  fileName.copy(buffer, ZIP_MINIMUM_LOCAL_FILE_HEADER_BYTES);
  compressed.copy(buffer, ZIP_MINIMUM_LOCAL_FILE_HEADER_BYTES + fileName.length);
  const descriptorOffset =
    ZIP_MINIMUM_LOCAL_FILE_HEADER_BYTES + fileName.length + compressed.length;
  buffer.writeUInt32LE(ZIP_DATA_DESCRIPTOR_SIGNATURE, descriptorOffset);
  buffer.writeUInt32LE(ZIP_EMPTY_CRC32, descriptorOffset + ZIP_DATA_DESCRIPTOR_CRC32_OFFSET);
  buffer.writeUInt32LE(
    compressed.length,
    descriptorOffset + ZIP_DATA_DESCRIPTOR_COMPRESSED_SIZE_OFFSET
  );
  buffer.writeUInt32LE(
    uncompressed.length,
    descriptorOffset + ZIP_DATA_DESCRIPTOR_UNCOMPRESSED_SIZE_OFFSET
  );
};

const writeZipCentralDirectory = (
  buffer: Buffer,
  fileName: Buffer,
  compressed: Buffer,
  uncompressed: Buffer,
  centralDirectoryOffset: number
): void => {
  buffer.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE, centralDirectoryOffset);
  buffer.writeUInt16LE(ZIP_VERSION, centralDirectoryOffset + ZIP_CENTRAL_VERSION_MADE_BY_OFFSET);
  buffer.writeUInt16LE(ZIP_VERSION, centralDirectoryOffset + ZIP_CENTRAL_VERSION_NEEDED_OFFSET);
  buffer.writeUInt16LE(
    ZIP_GENERAL_PURPOSE_DATA_DESCRIPTOR_FLAG,
    centralDirectoryOffset + ZIP_CENTRAL_GENERAL_PURPOSE_FLAG_OFFSET
  );
  buffer.writeUInt16LE(
    ZIP_DEFLATE_COMPRESSION,
    centralDirectoryOffset + ZIP_CENTRAL_COMPRESSION_METHOD_OFFSET
  );
  buffer.writeUInt16LE(
    ZIP_EMPTY_FIELD_LENGTH,
    centralDirectoryOffset + ZIP_CENTRAL_LAST_MODIFIED_TIME_OFFSET
  );
  buffer.writeUInt16LE(
    ZIP_EMPTY_FIELD_LENGTH,
    centralDirectoryOffset + ZIP_CENTRAL_LAST_MODIFIED_DATE_OFFSET
  );
  buffer.writeUInt32LE(ZIP_EMPTY_CRC32, centralDirectoryOffset + ZIP_CENTRAL_CRC32_OFFSET);
  buffer.writeUInt32LE(
    compressed.length,
    centralDirectoryOffset + ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET
  );
  buffer.writeUInt32LE(
    uncompressed.length,
    centralDirectoryOffset + ZIP_CENTRAL_UNCOMPRESSED_SIZE_OFFSET
  );
  buffer.writeUInt16LE(
    fileName.length,
    centralDirectoryOffset + ZIP_CENTRAL_FILE_NAME_LENGTH_OFFSET
  );
  buffer.writeUInt16LE(
    ZIP_EMPTY_FIELD_LENGTH,
    centralDirectoryOffset + ZIP_CENTRAL_EXTRA_FIELD_LENGTH_OFFSET
  );
  buffer.writeUInt16LE(
    ZIP_EMPTY_FIELD_LENGTH,
    centralDirectoryOffset + ZIP_CENTRAL_FILE_COMMENT_LENGTH_OFFSET
  );
  buffer.writeUInt16LE(ZIP_FIRST_DISK, centralDirectoryOffset + ZIP_CENTRAL_DISK_START_OFFSET);
  buffer.writeUInt16LE(
    ZIP_NO_INTERNAL_ATTRIBUTES,
    centralDirectoryOffset + ZIP_CENTRAL_INTERNAL_ATTRIBUTES_OFFSET
  );
  buffer.writeUInt32LE(
    ZIP_NO_EXTERNAL_ATTRIBUTES,
    centralDirectoryOffset + ZIP_CENTRAL_EXTERNAL_ATTRIBUTES_OFFSET
  );
  buffer.writeUInt32LE(
    ZIP_LOCAL_HEADER_OFFSET,
    centralDirectoryOffset + ZIP_CENTRAL_LOCAL_HEADER_OFFSET
  );
  fileName.copy(buffer, centralDirectoryOffset + ZIP_CENTRAL_DIRECTORY_FILE_HEADER_BYTES);
};

const writeZipEndOfCentralDirectory = (
  buffer: Buffer,
  centralDirectoryOffset: number,
  centralDirectorySize: number,
  endOfCentralDirectoryOffset: number
): void => {
  buffer.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE, endOfCentralDirectoryOffset);
  buffer.writeUInt16LE(
    ZIP_FIRST_DISK,
    endOfCentralDirectoryOffset + ZIP_END_CENTRAL_DIRECTORY_DISK_OFFSET
  );
  buffer.writeUInt16LE(
    ZIP_FIRST_DISK,
    endOfCentralDirectoryOffset + ZIP_END_CENTRAL_DIRECTORY_START_DISK_OFFSET
  );
  buffer.writeUInt16LE(
    ZIP_SINGLE_ENTRY_COUNT,
    endOfCentralDirectoryOffset + ZIP_END_CENTRAL_DIRECTORY_DISK_ENTRIES_OFFSET
  );
  buffer.writeUInt16LE(
    ZIP_SINGLE_ENTRY_COUNT,
    endOfCentralDirectoryOffset + ZIP_END_CENTRAL_DIRECTORY_TOTAL_ENTRIES_OFFSET
  );
  buffer.writeUInt32LE(
    centralDirectorySize,
    endOfCentralDirectoryOffset + ZIP_END_CENTRAL_DIRECTORY_SIZE_OFFSET
  );
  buffer.writeUInt32LE(
    centralDirectoryOffset,
    endOfCentralDirectoryOffset + ZIP_END_CENTRAL_DIRECTORY_OFFSET
  );
  buffer.writeUInt16LE(
    ZIP_EMPTY_FIELD_LENGTH,
    endOfCentralDirectoryOffset + ZIP_END_CENTRAL_DIRECTORY_COMMENT_LENGTH_OFFSET
  );
};

const createDataDescriptorZip = (entryName: string, entryText: string): Buffer => {
  const fileName = Buffer.from(entryName, "utf8");
  const uncompressed = Buffer.from(entryText, "utf8");
  const compressed = deflateRawSync(uncompressed);
  const localFileSize =
    ZIP_MINIMUM_LOCAL_FILE_HEADER_BYTES +
    fileName.length +
    compressed.length +
    ZIP_DATA_DESCRIPTOR_BYTES;
  const centralDirectorySize = ZIP_CENTRAL_DIRECTORY_FILE_HEADER_BYTES + fileName.length;
  const totalSize = localFileSize + centralDirectorySize + ZIP_END_OF_CENTRAL_DIRECTORY_BYTES;
  const buffer = Buffer.alloc(totalSize);

  writeZipFileHeader(buffer, fileName, compressed, uncompressed);
  writeZipCentralDirectory(buffer, fileName, compressed, uncompressed, localFileSize);
  writeZipEndOfCentralDirectory(
    buffer,
    localFileSize,
    centralDirectorySize,
    localFileSize + centralDirectorySize
  );

  return buffer;
};

const toExactArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const view = new Uint8Array(arrayBuffer);
  view.set(buffer);

  return arrayBuffer;
};

const createReadableArtifactStream = (content: Buffer) => {
  let unread = true;

  return {
    getReader: () => ({
      read: () => {
        const result = unread ? { done: false, value: content } : { done: true };
        unread = false;

        return Promise.resolve(result);
      }
    })
  };
};

const createArtifactBodyCases = (): Array<{ label: string; body: unknown }> => {
  const archive = createDataDescriptorZip(GRADING_RESULTS_PATH, GRADING_RESULTS_TEXT);
  const arrayBuffer = toExactArrayBuffer(archive);

  return [
    {
      label: "ArrayBuffer",
      body: arrayBuffer
    },
    {
      label: "Uint8Array",
      body: new Uint8Array(arrayBuffer)
    },
    {
      label: "Node Readable stream",
      body: Readable.from([archive])
    },
    {
      label: "Web ReadableStream",
      body: createReadableArtifactStream(archive)
    },
    {
      label: "Response-like arrayBuffer body",
      body: {
        arrayBuffer: () => Promise.resolve(arrayBuffer)
      }
    },
    {
      label: "Blob-like arrayBuffer body",
      body: {
        arrayBuffer: () => Promise.resolve(arrayBuffer)
      }
    }
  ];
};

const CONTENTS_LOOKUP_TRANSIENT_STATUSES = [
  OctokitTestNumber.ServerErrorStatus,
  OctokitTestNumber.BadGatewayStatus,
  OctokitTestNumber.ServiceUnavailableStatus,
  OctokitTestNumber.GatewayTimeoutStatus
] as const;

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

  it("rejects missing and whitespace-only production tokens", () => {
    expect(readGitHubToken({ GRAIDER_GITHUB_TOKEN: "  ", GITHUB_TOKEN: "\t" })).toBeUndefined();
    expect(() => createGitHubClient({ env: {} })).toThrow("GitHub token is required");
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

  it("getRepositoryFileContent requests path and ref then decodes base64 content", async () => {
    const octokit = createMockOctokit();
    let observedInput: Record<string, unknown> = {};
    octokit.rest.repos.getContent = (input = {}) => {
      observedInput = input;

      return resolvedResponse({
        type: "file",
        content: Buffer.from(WORKFLOW_CONTENT, "utf8").toString("base64"),
        encoding: "base64"
      });
    };
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expect(
      client.getRepositoryFileContent(OWNER, TEMPLATE_REPO, TEMPLATE_WORKFLOW_PATH, BRANCH)
    ).resolves.toBe(WORKFLOW_CONTENT);
    expect(observedInput).toEqual({
      owner: OWNER,
      repo: TEMPLATE_REPO,
      path: TEMPLATE_WORKFLOW_PATH,
      ref: BRANCH
    });
  });

  it("getRepositoryFileContent returns null for missing contents", async () => {
    const octokit = createMockOctokit();
    octokit.rest.repos.getContent = () =>
      rejectedResponse(createRequestError({ status: OctokitTestNumber.NotFoundStatus }));
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expect(
      client.getRepositoryFileContent(OWNER, TEMPLATE_REPO, TEMPLATE_WORKFLOW_PATH, BRANCH)
    ).resolves.toBeNull();
  });

  it("writeRepositoryFile creates missing files without sending SHA", async () => {
    const octokit = createMockOctokit();
    let observedWriteInput: Record<string, unknown> = {};
    octokit.rest.repos.getContent = () =>
      rejectedResponse(createRequestError({ status: OctokitTestNumber.NotFoundStatus }));
    octokit.rest.repos.createOrUpdateFileContents = (input = {}) => {
      observedWriteInput = input;

      return resolvedResponse({ commit: { sha: CREATED_SHA }, content: { path: CONTENT_PATH } });
    };
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    const result = await client.writeRepositoryFile({
      owner: OWNER,
      repo: REPO,
      path: CONTENT_PATH,
      content: FILE_CONTENT,
      message: "Create report"
    });

    expect(result).toEqual({ path: CONTENT_PATH, commitSha: CREATED_SHA });
    expect(Object.hasOwn(observedWriteInput, "sha")).toBe(false);
  });

  it("writeRepositoryFile retries transient contents lookup then creates missing file", async () => {
    const octokit = createMockOctokit();
    let contentsLookups = 0;
    let observedWriteInput: Record<string, unknown> = {};
    octokit.rest.repos.getContent = () => {
      contentsLookups += 1;

      return contentsLookups === 1
        ? rejectedResponse(createRequestError({ status: OctokitTestNumber.GatewayTimeoutStatus }))
        : rejectedResponse(createRequestError({ status: OctokitTestNumber.NotFoundStatus }));
    };
    octokit.rest.repos.createOrUpdateFileContents = (input = {}) => {
      observedWriteInput = input;

      return resolvedResponse({ commit: { sha: CREATED_SHA }, content: { path: CONTENT_PATH } });
    };
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    const result = await client.writeRepositoryFile({
      owner: OWNER,
      repo: REPO,
      path: CONTENT_PATH,
      content: FILE_CONTENT,
      message: "Create report"
    });

    expect(result).toEqual({ path: CONTENT_PATH, commitSha: CREATED_SHA });
    expect(contentsLookups).toBe(2);
    expect(Object.hasOwn(observedWriteInput, "sha")).toBe(false);
  });

  it("writeRepositoryFile retries transient contents write after refetching contents", async () => {
    const octokit = createMockOctokit();
    let contentsLookups = 0;
    let writeAttempts = 0;
    octokit.rest.repos.getContent = () => {
      contentsLookups += 1;

      return rejectedResponse(createRequestError({ status: OctokitTestNumber.NotFoundStatus }));
    };
    octokit.rest.repos.createOrUpdateFileContents = () => {
      writeAttempts += 1;

      return writeAttempts === 1
        ? rejectedResponse(
            createRequestError({ status: OctokitTestNumber.ServiceUnavailableStatus })
          )
        : resolvedResponse({ commit: { sha: CREATED_SHA }, content: { path: CONTENT_PATH } });
    };
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    const result = await client.writeRepositoryFile({
      owner: OWNER,
      repo: REPO,
      path: CONTENT_PATH,
      content: FILE_CONTENT,
      message: "Create report"
    });

    expect(result).toEqual({ path: CONTENT_PATH, commitSha: CREATED_SHA });
    expect(contentsLookups).toBe(2);
    expect(writeAttempts).toBe(2);
  });

  it.each(CONTENTS_LOOKUP_TRANSIENT_STATUSES)(
    "writeRepositoryFile maps contents lookup HTTP %s to github_api_error",
    async (status) => {
      const octokit = createMockOctokit();
      let writeAttempted = false;
      octokit.rest.repos.getContent = () => rejectedResponse(createRequestError({ status }));
      octokit.rest.repos.createOrUpdateFileContents = () => {
        writeAttempted = true;

        return resolvedResponse({ commit: { sha: CREATED_SHA }, content: { path: CONTENT_PATH } });
      };
      const client = new OctokitGitHubClient({ token: TOKEN, octokit });

      await expectGitHubError(
        () =>
          client.writeRepositoryFile({
            owner: OWNER,
            repo: REPO,
            path: CONTENT_PATH,
            content: FILE_CONTENT,
            message: "Publish report"
          }),
        DiagnosticCode.GithubApiError
      );
      expect(writeAttempted).toBe(false);
    }
  );

  it("dispatchWorkflow sends ref and omits inputs when none are provided", async () => {
    const octokit = createMockOctokit();
    let observedDispatchInput: Record<string, unknown> = {};
    octokit.rest.actions.createWorkflowDispatch = (input = {}) => {
      observedDispatchInput = input;

      return resolvedResponse({});
    };
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await client.dispatchWorkflow({
      owner: OWNER,
      repo: REPO,
      workflowPath: WORKFLOW_PATH,
      ref: BRANCH
    });

    expect(observedDispatchInput).toEqual({
      owner: OWNER,
      repo: REPO,
      workflow_id: WORKFLOW_PATH,
      ref: BRANCH
    });
    expect(Object.hasOwn(observedDispatchInput, "inputs")).toBe(false);
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

  it("downloadArtifact extracts files from zip entries that use data descriptors", async () => {
    const octokit = createMockOctokit();
    let observedDownloadInput: Record<string, unknown> = {};
    octokit.rest.actions.downloadArtifact = (input = {}) => {
      observedDownloadInput = input;

      return resolvedResponse(createDataDescriptorZip(GRADING_RESULTS_PATH, GRADING_RESULTS_TEXT));
    };
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expect(
      client.downloadArtifact({
        owner: OWNER,
        repo: REPO,
        runId: OctokitTestNumber.WorkflowRunId,
        artifactName: "grading-results"
      })
    ).resolves.toEqual({
      name: "grading-results",
      files: {
        [GRADING_RESULTS_PATH]: GRADING_RESULTS_TEXT
      }
    });
    expect(observedDownloadInput).toMatchObject({
      request: {
        parseSuccessResponseBody: false
      }
    });
  });

  it("downloadArtifact follows redirect responses before extracting files", async () => {
    const octokit = createMockOctokit();
    let observedRedirectRequest: Record<string, unknown> = {};
    octokit.rest.actions.downloadArtifact = (input = {}) => {
      expect(input).toMatchObject({
        request: {
          parseSuccessResponseBody: false
        }
      });

      return Promise.resolve({
        data: "",
        headers: {
          location: ARTIFACT_DOWNLOAD_URL
        },
        status: OctokitTestNumber.RedirectStatus
      });
    };
    octokit.request = (input = {}) => {
      observedRedirectRequest = input;

      return resolvedResponse(createDataDescriptorZip(GRADING_RESULTS_PATH, GRADING_RESULTS_TEXT));
    };
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expect(
      client.downloadArtifact({
        owner: OWNER,
        repo: REPO,
        runId: OctokitTestNumber.WorkflowRunId,
        artifactName: "grading-results"
      })
    ).resolves.toEqual({
      name: "grading-results",
      files: {
        [GRADING_RESULTS_PATH]: GRADING_RESULTS_TEXT
      }
    });
    expect(observedRedirectRequest).toMatchObject({
      method: "GET",
      url: ARTIFACT_DOWNLOAD_URL,
      request: {
        parseSuccessResponseBody: false
      }
    });
  });

  it("downloadArtifact rejects unsupported artifact body shapes", async () => {
    const octokit = createMockOctokit();
    octokit.rest.actions.downloadArtifact = () =>
      resolvedResponse({
        archive_download_url: ARTIFACT_DOWNLOAD_URL
      });
    const client = new OctokitGitHubClient({ token: TOKEN, octokit });

    await expectGitHubError(
      () =>
        client.downloadArtifact({
          owner: OWNER,
          repo: REPO,
          runId: OctokitTestNumber.WorkflowRunId,
          artifactName: "grading-results"
        }),
      DiagnosticCode.GithubApiError
    );
  });

  it.each(createArtifactBodyCases())(
    "downloadArtifact extracts files from $label",
    async ({ body }) => {
      const octokit = createMockOctokit();
      octokit.rest.actions.downloadArtifact = () => resolvedResponse(body);
      const client = new OctokitGitHubClient({ token: TOKEN, octokit });

      await expect(
        client.downloadArtifact({
          owner: OWNER,
          repo: REPO,
          runId: OctokitTestNumber.WorkflowRunId,
          artifactName: "grading-results"
        })
      ).resolves.toEqual({
        name: "grading-results",
        files: {
          [GRADING_RESULTS_PATH]: GRADING_RESULTS_TEXT
        }
      });
    }
  );
});
