import type { GitHubOrganizationResponse } from "./github-client.js";
import type { GitHubPermission, GitHubUser } from "./github-models.js";
import { FakeManagedTeamClient } from "./fake-managed-team-client.js";
import type { StudentRepositoryPermissionClient } from "./student-repository-permissions.js";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_NO_CONTENT = 204;
export interface FakeStudentPermissionRepository {
  id: number;
  node_id: string;
  name: string;
  owner: { id: number; login: string; type: string };
  archived: boolean;
  disabled: boolean;
  permissions: { admin: boolean };
}

/** Multi-repository v2 fake. No direct-collaborator mutation implementation is used by this slice. */
export class FakeStudentPermissionClient
  extends FakeManagedTeamClient
  implements StudentRepositoryPermissionClient
{
  readonly permissionRepositories = new Map<number, FakeStudentPermissionRepository>();
  readonly repositoryGrants = new Map<number, Map<number, GitHubPermission>>();
  readonly directGrants = new Map<number, Map<number, GitHubPermission>>();
  readonly teamPermissionWrites: {
    repositoryId: number;
    organizationId: number;
    teamId: number;
    owner: string;
    repo: string;
    permission: GitHubPermission;
  }[] = [];
  readonly repositoryIdReads: number[] = [];

  constructor(users: readonly GitHubUser[]) {
    super(users);
    this.scopes = "repo read:org";
  }
  private responseFor(data: unknown, status = HTTP_OK): GitHubOrganizationResponse {
    return { status, headers: {}, data: structuredClone(data) };
  }
  addPermissionRepository(id: number, owner: string, name: string): void {
    this.permissionRepositories.set(id, {
      id,
      node_id: `repository-${String(id)}`,
      owner: { id: this.organizationId, login: owner, type: "Organization" },
      name,
      archived: false,
      disabled: false,
      permissions: { admin: true }
    });
    this.repositoryGrants.set(id, new Map());
  }
  getCourseRepositoryById(repositoryId: number): Promise<GitHubOrganizationResponse> {
    this.repositoryIdReads.push(repositoryId);
    const repo = this.permissionRepositories.get(repositoryId);
    return Promise.resolve(repo ? this.responseFor(repo) : this.responseFor({}, HTTP_NOT_FOUND));
  }
  listCourseRepositoryTeamsPage(
    owner: string,
    repo: string,
    page: number,
    perPage: number
  ): Promise<GitHubOrganizationResponse> {
    const resource = [...this.permissionRepositories.values()].find(
      (value) => value.owner.login === owner && value.name === repo
    );
    if (!resource) return Promise.resolve(this.responseFor({}, HTTP_NOT_FOUND));
    return Promise.resolve(
      this.responseFor(
        [...(this.repositoryGrants.get(resource.id) ?? [])]
          .filter(([, permission]) => permission !== "none")
          .slice((page - 1) * perPage, page * perPage)
          .map(([id, permission]) => {
            const team = this.organizationTeams.find((value) => value.id === id);
            if (!team) throw new Error("Fake grant references an unknown team.");
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
    const resource = [...this.permissionRepositories.values()].find(
      (value) => value.owner.login === owner && value.name === repo
    );
    if (!resource || resource.owner.id !== organizationId)
      return Promise.resolve(this.responseFor({}, HTTP_NOT_FOUND));
    this.teamPermissionWrites.push({
      repositoryId: resource.id,
      organizationId,
      teamId,
      owner,
      repo,
      permission
    });
    const grants = this.repositoryGrants.get(resource.id) ?? new Map<number, GitHubPermission>();
    if (permission === "none") grants.delete(teamId);
    else grants.set(teamId, permission);
    this.repositoryGrants.set(resource.id, grants);
    return Promise.resolve(this.responseFor(null, HTTP_NO_CONTENT));
  }
}
