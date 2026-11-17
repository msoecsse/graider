import path from "node:path";
import type { ProcessRunner } from "./commandRunner.js";
import { managedCourseOperation } from "./managedCourseOperationContext.js";

/** Propagate only main-owned source/runtime context to CLI subprocesses. */
export const createManagedCourseProcessRunner =
  (base: ProcessRunner): ProcessRunner =>
  async (request) => {
    const operation = managedCourseOperation.getStore();
    if (
      operation &&
      request.command === "graider" &&
      request.args.some((argument) =>
        ["apply", "grade", "download-repositories", "report", "generate"].includes(argument)
      )
    )
      await operation.revalidate?.();
    return base(
      operation?.managed && !operation.transaction
        ? {
            ...request,
            env: {
              ...(request.env ?? process.env),
              GRAIDER_MANAGED_COURSE_SOURCE: operation.courseFolderPath,
              GRAIDER_MANAGED_COURSE_RUNTIME: path.join(
                path.dirname(operation.courseFolderPath),
                "runtime"
              )
            }
          }
        : request
    );
  };
