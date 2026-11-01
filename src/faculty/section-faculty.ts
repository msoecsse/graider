import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import { FacultyDirectory, type FacultyDirectoryRecord } from "./faculty-directory.js";

/** Section-scoped identity/history only; no permissions or lifecycle policy are granted here. */
export class SectionFaculty {
  private readonly course: RawCourseConfigV2;
  private readonly term: RawTermConfigV2;
  private readonly section: RawTermConfigV2["sections"][number];
  private readonly directory: FacultyDirectory;
  private readonly current: readonly FacultyDirectoryRecord[];
  private readonly former: readonly FacultyDirectoryRecord[];

  constructor(course: RawCourseConfigV2, term: RawTermConfigV2, sectionId: string) {
    this.course = rawCourseConfigV2Schema.parse(course);
    this.term = rawTermConfigV2Schema.parse(term);
    this.directory = new FacultyDirectory(this.course);
    const matches = this.term.sections.filter((section) => section.id === sectionId);
    const [section] = matches;
    if (matches.length !== 1 || section === undefined) {
      throw new Error("Section faculty requires exactly one matching section ID.");
    }
    this.section = section;
    this.term.sections.forEach((entry) => {
      [...entry.faculty.current, ...entry.faculty.former].forEach((reference) => {
        this.requireFaculty(reference.github_user_id);
      });
    });
    this.current = Object.freeze(
      section.faculty.current.map((reference) => this.requireFaculty(reference.github_user_id))
    );
    this.former = Object.freeze(
      section.faculty.former.map((reference) => this.requireFaculty(reference.github_user_id))
    );
  }

  getCurrentFaculty(): readonly FacultyDirectoryRecord[] {
    return this.current;
  }

  getFormerFaculty(): readonly FacultyDirectoryRecord[] {
    return this.former;
  }

  isCurrentFaculty(githubUserId: number): boolean {
    return this.current.some((record) => record.github_user_id === githubUserId);
  }

  isFormerFaculty(githubUserId: number): boolean {
    return this.former.some((record) => record.github_user_id === githubUserId);
  }

  addCurrentFaculty(githubUserId: number): RawTermConfigV2 {
    this.requireFaculty(githubUserId);
    if (this.isCurrentFaculty(githubUserId) || this.isFormerFaculty(githubUserId)) {
      throw new Error("Faculty already has section history; restore former faculty explicitly.");
    }
    return this.withFaculty({
      current: [...this.section.faculty.current, { github_user_id: githubUserId }],
      former: this.section.faculty.former
    });
  }

  removeCurrentFaculty(githubUserId: number): RawTermConfigV2 {
    this.requireFaculty(githubUserId);
    if (!this.isCurrentFaculty(githubUserId)) {
      throw new Error("Only current section faculty can move to former history.");
    }
    return this.withFaculty({
      current: this.section.faculty.current.filter(
        (reference) => reference.github_user_id !== githubUserId
      ),
      former: [...this.section.faculty.former, { github_user_id: githubUserId }]
    });
  }

  restoreFormerFaculty(githubUserId: number): RawTermConfigV2 {
    this.requireFaculty(githubUserId);
    if (!this.isFormerFaculty(githubUserId)) {
      throw new Error("Only former section faculty can be restored.");
    }
    return this.withFaculty({
      current: [...this.section.faculty.current, { github_user_id: githubUserId }],
      former: this.section.faculty.former.filter(
        (reference) => reference.github_user_id !== githubUserId
      )
    });
  }

  private requireFaculty(githubUserId: number): FacultyDirectoryRecord {
    const record = this.directory.resolveByGithubUserId(githubUserId);
    if (record === undefined) {
      throw new Error("Section faculty must reference an existing faculty directory member.");
    }
    return record;
  }

  private withFaculty(faculty: RawTermConfigV2["sections"][number]["faculty"]): RawTermConfigV2 {
    const sections = this.term.sections.map((section) =>
      section.id === this.section.id ? { ...section, faculty } : section
    );
    return new SectionFaculty(this.course, { ...this.term, sections }, this.section.id).term;
  }
}
