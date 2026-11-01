import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import { FacultyDirectory, type FacultyDirectoryRecord } from "./faculty-directory.js";

/** Term-scoped role identity/history only; this model grants no operational permissions. */
export class TermCoordinators {
  private readonly course: RawCourseConfigV2;
  private readonly term: RawTermConfigV2;
  private readonly directory: FacultyDirectory;
  private readonly current: readonly FacultyDirectoryRecord[];
  private readonly former: readonly FacultyDirectoryRecord[];

  constructor(course: RawCourseConfigV2, term: RawTermConfigV2) {
    this.course = rawCourseConfigV2Schema.parse(course);
    this.term = rawTermConfigV2Schema.parse(term);
    this.directory = new FacultyDirectory(this.course);
    if (this.term.coordinators.current.length === 0) {
      throw new Error("A term coordinator model requires at least one current coordinator.");
    }
    this.current = Object.freeze(
      this.term.coordinators.current.map((reference) =>
        this.requireFaculty(reference.github_user_id)
      )
    );
    this.former = Object.freeze(
      this.term.coordinators.former.map((reference) =>
        this.requireFaculty(reference.github_user_id)
      )
    );
  }

  getCurrentCoordinators(): readonly FacultyDirectoryRecord[] {
    return this.current;
  }

  getFormerCoordinators(): readonly FacultyDirectoryRecord[] {
    return this.former;
  }

  isCurrentCoordinator(githubUserId: number): boolean {
    return this.current.some((record) => record.github_user_id === githubUserId);
  }

  isFormerCoordinator(githubUserId: number): boolean {
    return this.former.some((record) => record.github_user_id === githubUserId);
  }

  addCurrentCoordinator(githubUserId: number): RawTermConfigV2 {
    this.requireFaculty(githubUserId);
    if (this.isCurrentCoordinator(githubUserId) || this.isFormerCoordinator(githubUserId)) {
      throw new Error(
        "Faculty already has coordinator history; restore former coordinators explicitly."
      );
    }
    return this.withCoordinators({
      current: [...this.term.coordinators.current, { github_user_id: githubUserId }],
      former: this.term.coordinators.former
    });
  }

  removeCurrentCoordinator(githubUserId: number): RawTermConfigV2 {
    this.requireFaculty(githubUserId);
    if (!this.isCurrentCoordinator(githubUserId)) {
      throw new Error("Only a current coordinator can move to former history.");
    }
    return this.withCoordinators({
      current: this.term.coordinators.current.filter(
        (reference) => reference.github_user_id !== githubUserId
      ),
      former: [...this.term.coordinators.former, { github_user_id: githubUserId }]
    });
  }

  restoreFormerCoordinator(githubUserId: number): RawTermConfigV2 {
    this.requireFaculty(githubUserId);
    if (!this.isFormerCoordinator(githubUserId)) {
      throw new Error("Only a former coordinator can be restored.");
    }
    return this.withCoordinators({
      current: [...this.term.coordinators.current, { github_user_id: githubUserId }],
      former: this.term.coordinators.former.filter(
        (reference) => reference.github_user_id !== githubUserId
      )
    });
  }

  private requireFaculty(githubUserId: number): FacultyDirectoryRecord {
    const record = this.directory.resolveByGithubUserId(githubUserId);
    if (record === undefined) {
      throw new Error("Term coordinator must reference an existing faculty directory member.");
    }
    return record;
  }

  private withCoordinators(coordinators: RawTermConfigV2["coordinators"]): RawTermConfigV2 {
    return new TermCoordinators(this.course, { ...this.term, coordinators }).term;
  }
}
