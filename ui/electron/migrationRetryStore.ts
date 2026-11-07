import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
import { identityComponent, MANAGED_COURSE_ROOT, safeDirectories } from "./managedCourses.js";
import { loadMigrationReviewBackend } from "./migrationReviewService.js";
const FILE_NAME = "migration-retry.json";
const FILE_MODE = 0o600;
const MAX_RECORD_BYTES = 16 * 1024;
const regular = (file: string): boolean => {
  const stat = fs.lstatSync(file);
  return (
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= MAX_RECORD_BYTES
  );
};
/** Main-owned hint only. No arbitrary paths, renderer assertions, errors or credentials are saved. */
export const createMigrationRetryStore = (
  userData: string,
  backend = loadMigrationReviewBackend
) => {
  const directory = (userId: number, repositoryId: number) =>
    path.join(
      userData,
      MANAGED_COURSE_ROOT,
      identityComponent(userId),
      identityComponent(repositoryId)
    );
  return {
    read(userId: number, repositoryId: number): Backend.MigrationRetryArtifact | null {
      const parent = directory(userId, repositoryId);
      safeDirectories(userData, parent);
      const file = path.join(parent, FILE_NAME);
      try {
        if (!regular(file)) return null;
        const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        const parsed = backend().migrationRetryArtifactSchema.safeParse(value);
        return parsed.success &&
          parsed.data.binding.authenticatedGithubUserId === userId &&
          parsed.data.binding.repositoryId === repositoryId
          ? parsed.data
          : null;
      } catch {
        return null;
      }
    },
    write(value: unknown): void {
      const parsed = backend().migrationRetryArtifactSchema.safeParse(value);
      if (!parsed.success) throw new Error("Invalid migration retry record.");
      const record = parsed.data;
      const parent = directory(
        record.binding.authenticatedGithubUserId,
        record.binding.repositoryId
      );
      safeDirectories(userData, parent, true);
      const file = path.join(parent, FILE_NAME);
      try {
        if (!regular(file)) throw new Error("Unsafe migration retry record.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const temporary = path.join(parent, `${FILE_NAME}.${randomUUID()}.tmp`);
      fs.writeFileSync(temporary, `${JSON.stringify(record)}\n`, { flag: "wx", mode: FILE_MODE });
      try {
        fs.renameSync(temporary, file);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }
  };
};
