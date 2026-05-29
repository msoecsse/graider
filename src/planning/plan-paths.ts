import path from "node:path";
import { type Clock, formatFilesystemTimestamp } from "../core/clock.js";

const TERMS_DIRECTORY = "terms";
const PLANS_DIRECTORY = "plans";
const PLAN_FILE_PREFIX = "plan";
const PLAN_FILE_EXTENSION = "json";

export interface PlanPathResult {
  relativeDirectory: string;
  relativePath: string;
  absolutePath: string;
}

export const createPlanPath = (
  repoRoot: string,
  termCode: string,
  assignmentSlug: string,
  clock: Clock
): PlanPathResult => {
  const relativeDirectory = path.posix.join(
    TERMS_DIRECTORY,
    termCode,
    PLANS_DIRECTORY,
    assignmentSlug
  );
  const fileName = `${PLAN_FILE_PREFIX}-${formatFilesystemTimestamp(clock.now())}.${PLAN_FILE_EXTENSION}`;
  const relativePath = path.posix.join(relativeDirectory, fileName);

  return {
    relativeDirectory,
    relativePath,
    absolutePath: path.join(repoRoot, relativePath)
  };
};
