import type { GitHubCoursePermissionClient, GitHubOrganizationResponse } from "./github-client.js";
import type { GitHubPermission, GitHubUser } from "./github-models.js";
import { FakeManagedTeamClient } from "./fake-managed-team-client.js";

const REPOSITORY_ID = 123;
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;

/** Isolated v2 permission fake; legacy v1 fake permission semantics are unchanged. */
export class FakeCoursePermissionClient
  extends FakeManagedTeamClient
  implements GitHubCoursePermissionClient
{
  readonly repository = {
    id: REPOSITORY_ID,
    node_id: "repository-node",
    name: "current-course-admin",
    owner: { id: this.organizationId, login: "example-org", type: "Organization" },
    archived: false,
    disabled: false,
    permissions: { admin: true }
  };
  readonly repositoryTeamPermissions = new Map<number, GitHubPermission>();
  readonly directCollaboratorPermissions = new Map<number, GitHubPermission>();
  readonly teamPermissionWrites: {
    teamId: number;
    owner: string;
    repo: string;
    permission: GitHubPermission;
  }[] = [];
  readonly fallbackPermissionWrites: { owner: string; repo: string; login: string }[] = [];
  readonly fallbackTeamSources = new Set<number>();

  constructor(users: readonly GitHubUser[]) {
    super(users);
    this.scopes = "repo read:org";
  }

  private permissionResponse(data: unknown, status = HTTP_OK): GitHubOrganizationResponse {
    return { status, headers: {}, data: structuredClone(data) };
  }

  getCourseRepositoryById(): Promise<GitHubOrganizationResponse> {
    return Promise.resolve(this.permissionResponse(this.repository));
  }

  listCourseRepositoryTeamsPage(
    owner: string,
    repo: string,
    page: number,
    perPage: number
  ): Promise<GitHubOrganizationResponse> {
    if (owner !== this.repository.owner.login || repo !== this.repository.name)
      return Promise.resolve(this.permissionResponse({}, HTTP_NOT_FOUND));
    return Promise.resolve(
      this.permissionResponse(
        [...this.repositoryTeamPermissions]
          .filter(([, value]) => value !== "none")
          .slice((page - 1) * perPage, page * perPage)
          .map(([id, permission]) => {
            const team = this.organizationTeams.find((value) => value.id === id);
            if (!team) throw new Error("Fake permission references an unknown team.");
            return {
              id,
              name: team.name,
              slug: team.slug,
              description: team.description ?? null,
              parent: team.parentId ? { id: team.parentId } : null,
              permission
            };
          })
      )
    );
  }

  setCourseRepositoryTeamPermission(
    organizationId: number,
    teamId: number,
    owner: string,
    repo: string,
    permission: "admin" | "push" | "pull" | "none"
  ): Promise<GitHubOrganizationResponse> {
    if (
      organizationId !== this.organizationId ||
      owner !== this.repository.owner.login ||
      repo !== this.repository.name
    )
      return Promise.resolve(this.permissionResponse({}, HTTP_NOT_FOUND));
    this.teamPermissionWrites.push({ teamId, owner, repo, permission });
    if (permission === "none") this.repositoryTeamPermissions.delete(teamId);
    else this.repositoryTeamPermissions.set(teamId, permission);
    return Promise.resolve(this.permissionResponse(null, HTTP_NO_CONTENT));
  }

  async getCourseFallbackPermissionPage(
    repositoryNodeId: string,
    login: string
  ): Promise<GitHubOrganizationResponse> {
    if (repositoryNodeId !== this.repository.node_id)
      return this.permissionResponse({}, HTTP_NOT_FOUND);
    const user = await this.getUser(login);
    const id = user?.id;
    const direct = id === undefined ? undefined : this.directCollaboratorPermissions.get(id);
    const team = id !== undefined && this.fallbackTeamSources.has(id);
    const graphqlPermission: Record<string, string> = {
      admin: "ADMIN",
      push: "WRITE",
      pull: "READ",
      maintain: "MAINTAIN",
      triage: "TRIAGE",
      none: "NONE"
    };
    const sources = [
      ...(direct
        ? [
            {
              permission: graphqlPermission[direct],
              roleName: direct,
              organization: { databaseId: this.organizationId },
              source: { __typename: "Repository", databaseId: this.repository.id }
            }
          ]
        : []),
      ...(team
        ? [
            {
              permission: "ADMIN",
              roleName: "admin",
              organization: { databaseId: this.organizationId },
              source: { __typename: "Team" }
            }
          ]
        : [])
    ];
    return this.permissionResponse({
      data: {
        node: {
          databaseId: this.repository.id,
          owner: { databaseId: this.repository.owner.id },
          collaborators: {
            edges:
              user && sources.length
                ? [{ node: { databaseId: id, login: user.username }, permissionSources: sources }]
                : [],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    });
  }

  async setCourseFallbackPermission(
    owner: string,
    repo: string,
    login: string
  ): Promise<GitHubOrganizationResponse> {
    const user = await this.getUser(login);
    if (!user?.id || owner !== this.repository.owner.login || repo !== this.repository.name)
      return this.permissionResponse({}, HTTP_NOT_FOUND);
    this.fallbackPermissionWrites.push({ owner, repo, login });
    this.directCollaboratorPermissions.set(user.id, "admin");
    return this.permissionResponse(null, HTTP_NO_CONTENT);
  }
}
