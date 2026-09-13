import fs from "node:fs";
import path from "node:path";

export const LOCAL_REPOSITORY_LOCATOR_FILE_NAME = "student-repository-locators.json";
export interface LocalRepositoryLocatorKey {
  readonly courseFolderId: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}
interface Locator extends LocalRepositoryLocatorKey {
  readonly localPath: string;
}
export interface SuccessfulDownloadTarget {
  readonly status?: string;
  readonly localPath?: string;
  readonly studentIds?: readonly string[];
}
interface Registry {
  readonly schemaVersion: 1;
  readonly locators: readonly Locator[];
}
export type LocalRepositoryResolution =
  | { readonly status: "success"; readonly localPath: string }
  | { readonly status: "repository_not_recorded" | "repository_unavailable" | "registry_error" };
export const getLocalRepositoryLocatorPath = (userDataPath: string): string =>
  path.join(userDataPath, LOCAL_REPOSITORY_LOCATOR_FILE_NAME);
const empty = (): Registry => ({ schemaVersion: 1, locators: [] });
const load = (file: string): Registry | null => {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as Registry;
    return value.schemaVersion === 1 && Array.isArray(value.locators) ? value : null;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? empty() : null;
  }
};
const same = (left: LocalRepositoryLocatorKey, right: LocalRepositoryLocatorKey): boolean =>
  left.courseFolderId === right.courseFolderId &&
  left.termCode === right.termCode &&
  left.assignmentSlug === right.assignmentSlug &&
  left.studentId === right.studentId;
export const recordLocalRepository = (file: string, locator: Locator): boolean => {
  const registry = load(file);
  if (registry === null) return false;
  const locators = [
    ...registry.locators.filter((entry) => !same(entry, locator)),
    { ...locator, localPath: path.resolve(locator.localPath) }
  ];
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      `${JSON.stringify({ schemaVersion: 1, locators }, undefined, 2)}\n`,
      "utf8"
    );
    return true;
  } catch {
    return false;
  }
};
export const resolveLocalStudentRepository = (
  file: string,
  key: LocalRepositoryLocatorKey
): LocalRepositoryResolution => {
  const registry = load(file);
  if (registry === null) return { status: "registry_error" };
  const locator = registry.locators.find((entry) => same(entry, key));
  if (locator === undefined) return { status: "repository_not_recorded" };
  try {
    const localPath = fs.realpathSync(locator.localPath);
    return fs.statSync(localPath).isDirectory()
      ? { status: "success", localPath }
      : { status: "repository_unavailable" };
  } catch {
    return { status: "repository_unavailable" };
  }
};

export const recordSuccessfulDownloadLocators = (
  file: string,
  identity: Omit<LocalRepositoryLocatorKey, "studentId">,
  targets: readonly SuccessfulDownloadTarget[]
): void => {
  for (const target of targets)
    if (target.status === "cloned" && typeof target.localPath === "string")
      for (const studentId of target.studentIds ?? [])
        recordLocalRepository(file, { ...identity, studentId, localPath: target.localPath });
};
