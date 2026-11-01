import type { RawCourseConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema } from "../config/config-schemas.js";
import { FacultyDirectory, type FacultyDirectoryRecord } from "./faculty-directory.js";

/** Course recovery identity only. This model does not grant coordinator or section permissions. */
export class FallbackAdministrator {
  private readonly course: RawCourseConfigV2;
  private readonly directory: FacultyDirectory;
  private readonly facultyRecord: FacultyDirectoryRecord;

  constructor(course: RawCourseConfigV2) {
    this.course = rawCourseConfigV2Schema.parse(course);
    this.directory = new FacultyDirectory(this.course);
    const record = this.directory.resolveByGithubUserId(
      this.course.fallback_administrator.github_user_id
    );
    if (record === undefined) {
      throw new Error(
        "Fallback administrator must reference an existing faculty directory member."
      );
    }
    this.facultyRecord = record;
  }

  getFacultyRecord(): FacultyDirectoryRecord {
    return this.facultyRecord;
  }

  isFallbackAdministrator(authenticatedGithubUserId: number): boolean {
    return this.facultyRecord.github_user_id === authenticatedGithubUserId;
  }

  /** Pure domain transition; caller authorization and publication belong to later slices. */
  transferTo(githubUserId: number): RawCourseConfigV2 {
    if (this.directory.resolveByGithubUserId(githubUserId) === undefined) {
      throw new Error(
        "Fallback administrator transfer requires an existing faculty directory member."
      );
    }
    return rawCourseConfigV2Schema.parse({
      ...this.course,
      fallback_administrator: { github_user_id: githubUserId }
    });
  }
}
