import type { FacultyIdentity, RawCourseConfigV2 } from "../config/config-models.js";

export interface FacultyDirectoryRecord extends Readonly<
  Omit<FacultyIdentity, "github_login_history">
> {
  readonly github_login_history: readonly string[];
}

/** Identity lookup over a validated v2 course. This does not grant course permissions. */
export class FacultyDirectory {
  private readonly byGithubUserId = new Map<number, FacultyDirectoryRecord>();
  private readonly byInstitutionalUsername = new Map<string, FacultyDirectoryRecord>();

  constructor(course: RawCourseConfigV2) {
    course.faculty_directory.forEach((identity) => {
      const record = Object.freeze({
        ...identity,
        github_login_history: Object.freeze([...identity.github_login_history])
      });
      this.byGithubUserId.set(record.github_user_id, record);
      this.byInstitutionalUsername.set(record.institutional_username.toLowerCase(), record);
    });
  }

  /** Canonical authenticated-account match. Logins are never fallback keys. */
  resolveByGithubUserId(userId: number): FacultyDirectoryRecord | undefined {
    return this.byGithubUserId.get(userId);
  }

  /** Transitional internal lookup for term metadata, not an authentication match. */
  resolveByInstitutionalUsername(username: string): FacultyDirectoryRecord | undefined {
    return this.byInstitutionalUsername.get(username.toLowerCase());
  }
}
