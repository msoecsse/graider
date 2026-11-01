import type {
  GitHubFacultyOrganizationClient,
  GitHubOrganizationResponse
} from "./github-client.js";
import type { GitHubUser } from "./github-models.js";
import { FakeGitHubClient } from "./fake-github-client.js";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_UNPROCESSABLE = 422;
const DEFAULT_ACCOUNT_ID = 100;

/** Isolated v2 fake. Legacy v1 fake defaults and setup flows remain unchanged. */
export class FakeFacultyOrganizationClient
  extends FakeGitHubClient
  implements GitHubFacultyOrganizationClient
{
  readonly organizationMembers = new Map<string, GitHubUser[]>();
  readonly organizationInvitations = new Map<
    string,
    { id: number; login: string | null; role: string }[]
  >();
  readonly invitationsCreated: { organization: string; githubUserId: number }[] = [];
  scopes = "admin:org";
  role = "admin";
  accountId = DEFAULT_ACCOUNT_ID;
  private readonly identities: readonly GitHubUser[];

  constructor(users: readonly GitHubUser[]) {
    super({ users: [...users] });
    this.identities = structuredClone(users);
  }

  private response(data: unknown, status = HTTP_OK): GitHubOrganizationResponse {
    return { status, headers: { "x-oauth-scopes": this.scopes }, data };
  }

  getOrganizationScopeResponse(): Promise<GitHubOrganizationResponse> {
    return Promise.resolve(this.response({ id: this.accountId, login: "signed-in-faculty" }));
  }

  getOrganizationMembership(org: string): Promise<GitHubOrganizationResponse> {
    return Promise.resolve(
      this.response({ state: "active", role: this.role, organization: { login: org } })
    );
  }

  listOrganizationMembersPage(
    org: string,
    page: number,
    perPage: number
  ): Promise<GitHubOrganizationResponse> {
    return Promise.resolve(
      this.response(
        (this.organizationMembers.get(org) ?? [])
          .slice((page - 1) * perPage, page * perPage)
          .map((value) => ({ id: value.id, login: value.username }))
      )
    );
  }

  listPendingOrganizationInvitationsPage(
    org: string,
    page: number,
    perPage: number
  ): Promise<GitHubOrganizationResponse> {
    return Promise.resolve(
      this.response(
        structuredClone(
          (this.organizationInvitations.get(org) ?? []).slice((page - 1) * perPage, page * perPage)
        )
      )
    );
  }

  createOrganizationInvitation(
    org: string,
    githubUserId: number
  ): Promise<GitHubOrganizationResponse> {
    const identity = this.identities.find((value) => value.id === githubUserId);
    if (!identity) return Promise.resolve(this.response({}, HTTP_UNPROCESSABLE));
    this.invitationsCreated.push({ organization: org, githubUserId });
    const invitations = this.organizationInvitations.get(org) ?? [];
    const invitation = {
      id: invitations.length + 1,
      login: identity.username,
      role: "direct_member"
    };
    invitations.push(invitation);
    this.organizationInvitations.set(org, invitations);
    return Promise.resolve(this.response(invitation, HTTP_CREATED));
  }
}
