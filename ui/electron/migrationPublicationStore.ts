import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { identityComponent, MANAGED_COURSE_ROOT, safeDirectories } from "./managedCourses.js";
import { loadMigrationReviewBackend } from "./migrationReviewService.js";
import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
const FILE_NAME = "migration-publication.json";
const FILE_MODE = 0o600;
const MAX_RECORD_BYTES = 16 * 1024;
const regular = (file: string): boolean => {
  const stat = fs.lstatSync(file);
  return (
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= MAX_RECORD_BYTES
  );
};
/** Durable write-ahead locator only. Recovery never restores review authority or pushes it. */
export const createMigrationPublicationStore = (userData: string) => {
  const directory = (userId: number, repositoryId: number) =>
    path.join(
      userData,
      MANAGED_COURSE_ROOT,
      identityComponent(userId),
      identityComponent(repositoryId)
    );
  return {
    read(userId: number, repositoryId: number): Backend.MigrationPublicationIntent | null {
      const parent = directory(userId, repositoryId);
      safeDirectories(userData, parent);
      const file = path.join(parent, FILE_NAME);
      try {
        if (!regular(file))
          throw new Error("Unsafe migration publication record requires attention.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      const record = loadMigrationReviewBackend().migrationPublicationIntentSchema.parse(
        JSON.parse(fs.readFileSync(file, "utf8"))
      );
      if (
        record.binding.authenticatedGithubUserId !== userId ||
        record.binding.repositoryId !== repositoryId
      )
        throw new Error("Foreign migration publication record requires attention.");
      return record;
    },
    write(value: Backend.MigrationPublicationIntent): void {
      const record = loadMigrationReviewBackend().migrationPublicationIntentSchema.parse(value);
      const parent = directory(
        record.binding.authenticatedGithubUserId,
        record.binding.repositoryId
      );
      safeDirectories(userData, parent, true);
      const file = path.join(parent, FILE_NAME);
      if (fs.existsSync(file) && !regular(file))
        throw new Error("Unsafe migration publication record.");
      const temporary = path.join(parent, `${FILE_NAME}.${randomUUID()}.tmp`);
      const descriptor = fs.openSync(temporary, "wx", FILE_MODE);
      try {
        fs.writeFileSync(descriptor, `${JSON.stringify(record)}\n`);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      try {
        fs.renameSync(temporary, file);
        // Windows does not support fsync on directory handles. The file itself is
        // flushed before its atomic rename on both first-class platforms.
        if (process.platform !== "win32") {
          const parentDescriptor = fs.openSync(parent, "r");
          try {
            fs.fsyncSync(parentDescriptor);
          } finally {
            fs.closeSync(parentDescriptor);
          }
        }
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }
  };
};
