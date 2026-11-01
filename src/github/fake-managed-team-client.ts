import type { GitHubManagedTeamClient, GitHubOrganizationResponse } from "./github-client.js";
import type { GitHubTeam, GitHubUser } from "./github-models.js";
import { FakeFacultyOrganizationClient } from "./fake-faculty-organization-client.js";

const ORGANIZATION_ID = 200;
const FIRST_TEAM_ID = 1000;
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;

export interface FakeManagedTeam extends GitHubTeam {
  id: number;
  parentId?: number | null;
}

/** Isolated v2 transport fake. It records only team creation and direct membership changes. */
export class FakeManagedTeamClient
  extends FakeFacultyOrganizationClient
  implements GitHubManagedTeamClient
{
  organizationId = ORGANIZATION_ID;
  readonly organizationTeams: FakeManagedTeam[] = [];
  readonly members = new Map<number, GitHubUser[]>();
  readonly teamsCreated: { org: string; name: string; description: string; id: number }[] = [];
  readonly membershipWrites: {
    organizationId: number;
    teamId: number;
    username: string;
    present: boolean;
  }[] = [];
  private nextTeamId = FIRST_TEAM_ID;

  private teamResponse(data: unknown, status = HTTP_OK): GitHubOrganizationResponse {
    return { status, headers: { "x-oauth-scopes": this.scopes }, data };
  }

  override getOrganizationMembership(org: string): Promise<GitHubOrganizationResponse> {
    return Promise.resolve(
      this.teamResponse({
        state: "active",
        role: this.role,
        organization: { login: org, id: this.organizationId }
      })
    );
  }

  private resource(team: FakeManagedTeam): unknown {
    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      description: team.description ?? null,
      parent: team.parentId ? { id: team.parentId } : null,
      organization: { id: this.organizationId, login: team.org }
    };
  }

  listManagedOrganizationTeamsPage(
    org: string,
    page: number,
    perPage: number
  ): Promise<GitHubOrganizationResponse> {
    return Promise.resolve(
      this.teamResponse(
        this.organizationTeams
          .filter((team) => team.org.toLowerCase() === org.toLowerCase())
          .slice((page - 1) * perPage, page * perPage)
          .map((team) => this.resource(team))
      )
    );
  }

  getManagedTeam(organizationId: number, teamId: number): Promise<GitHubOrganizationResponse> {
    const team = this.organizationTeams.find((value) => value.id === teamId);
    return Promise.resolve(
      team && organizationId === this.organizationId
        ? this.teamResponse(this.resource(team))
        : this.teamResponse({}, HTTP_NOT_FOUND)
    );
  }

  listManagedTeamMembersPage(
    organizationId: number,
    teamId: number,
    page: number,
    perPage: number
  ): Promise<GitHubOrganizationResponse> {
    if (organizationId !== this.organizationId)
      return Promise.resolve(this.teamResponse({}, HTTP_NOT_FOUND));
    return Promise.resolve(
      this.teamResponse(
        (this.members.get(teamId) ?? [])
          .slice((page - 1) * perPage, page * perPage)
          .map((value) => ({ id: value.id, login: value.username }))
      )
    );
  }

  createManagedTeam(
    org: string,
    name: string,
    description: string
  ): Promise<GitHubOrganizationResponse> {
    while (this.organizationTeams.some((value) => value.id === this.nextTeamId))
      this.nextTeamId += 1;
    const team: FakeManagedTeam = {
      id: this.nextTeamId++,
      name,
      slug: name.toLowerCase().replace(/[^a-z\d]+/g, "-"),
      description,
      org
    };
    this.organizationTeams.push(team);
    this.teamsCreated.push({ org, name, description, id: team.id });
    return Promise.resolve(this.teamResponse(this.resource(team), HTTP_CREATED));
  }

  async setManagedTeamMembership(
    organizationId: number,
    teamId: number,
    username: string,
    present: boolean
  ): Promise<GitHubOrganizationResponse> {
    const user = await this.getUser(username);
    if (
      !user ||
      organizationId !== this.organizationId ||
      !this.organizationTeams.some((team) => team.id === teamId)
    )
      return this.teamResponse({}, HTTP_NOT_FOUND);
    this.membershipWrites.push({ organizationId, teamId, username, present });
    const members = (this.members.get(teamId) ?? []).filter((value) => value.id !== user.id);
    if (present) members.push(user);
    this.members.set(teamId, members);
    return this.teamResponse(
      present ? { state: "active", role: "member" } : null,
      present ? HTTP_OK : HTTP_NO_CONTENT
    );
  }
}
