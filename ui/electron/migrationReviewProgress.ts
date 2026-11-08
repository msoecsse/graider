import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { identityComponent, MANAGED_COURSE_ROOT, safeDirectories } from "./managedCourses.js";
import { loadMigrationReviewBackend } from "./migrationReviewService.js";

const FILE_NAME = "migration-review.json";
const FILE_MODE = 0o600;
const MAX_RECORD_BYTES = 256 * 1024;
const schema = () => loadMigrationReviewBackend().migrationReviewProgressSchema;
import type { MigrationReviewProgress } from "./migrationReviewTypes.js";
export type {
  MigrationReviewProgressStore,
  MigrationReviewProgress
} from "./migrationReviewTypes.js";
const regular = (file: string): boolean => {
  const stat = fs.lstatSync(file);
  return (
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= MAX_RECORD_BYTES
  );
};
/** Local decisions only. No completion, acknowledgement or executable approval is stored. */
export const createMigrationReviewProgressStore = (userData: string) => {
  const directory = (userId: number, repositoryId: number) =>
    path.join(
      userData,
      MANAGED_COURSE_ROOT,
      identityComponent(userId),
      identityComponent(repositoryId)
    );
  return {
    read(userId: number, repositoryId: number): MigrationReviewProgress | null {
      try {
        const parent = directory(userId, repositoryId);
        safeDirectories(userData, parent);
        const file = path.join(parent, FILE_NAME);
        if (!regular(file)) return null;
        const parsed = schema().safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
        return parsed.success &&
          parsed.data.submission.source.authenticatedGithubUserId === userId &&
          parsed.data.submission.source.repositoryId === repositoryId
          ? parsed.data
          : null;
      } catch {
        return null;
      }
    },
    write(value: unknown): void {
      const record = schema().parse(value);
      const bytes = `${JSON.stringify(record)}\n`;
      if (Buffer.byteLength(bytes) > MAX_RECORD_BYTES)
        throw new Error("Review progress is too large.");
      const source = record.submission.source;
      const parent = directory(source.authenticatedGithubUserId, source.repositoryId);
      safeDirectories(userData, parent, true);
      const file = path.join(parent, FILE_NAME);
      try {
        if (!regular(file)) throw new Error("Unsafe review progress.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const temporary = path.join(parent, `${FILE_NAME}.${randomUUID()}.tmp`);
      try {
        fs.writeFileSync(temporary, bytes, { flag: "wx", mode: FILE_MODE });
        fs.renameSync(temporary, file);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }
  };
};
