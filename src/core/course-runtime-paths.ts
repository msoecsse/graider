import fs from "node:fs";
import path from "node:path";

// Main-process backend bundles share this map. The CLI receives the same trusted
// source/runtime pair through its process environment, never a renderer parameter.
const ROOTS: unique symbol = Symbol.for("graider.managed-course.runtime-roots");
const shared = globalThis as typeof globalThis & { [ROOTS]?: Map<string, string> };
const sourceIdentity = (source: string): string => {
  try {
    return fs.realpathSync.native(source);
  } catch {
    return path.resolve(source);
  }
};
export const registerCourseRuntimeRoot = (source: string, runtime: string): void => {
  const relatives = [
    path.relative(path.resolve(source), path.resolve(runtime)),
    path.relative(sourceIdentity(source), sourceIdentity(runtime))
  ];
  if (
    relatives.some(
      (relative) =>
        !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)
    )
  )
    throw new Error("Course runtime storage must be outside the source repository.");
  let roots = shared[ROOTS];
  if (!roots) {
    roots = new Map<string, string>();
    shared[ROOTS] = roots;
  }
  roots.set(sourceIdentity(source), path.resolve(runtime));
};
export const courseRuntimeRoot = (source: string): string =>
  shared[ROOTS]?.get(sourceIdentity(source)) ??
  (process.env.GRAIDER_MANAGED_COURSE_SOURCE &&
  sourceIdentity(process.env.GRAIDER_MANAGED_COURSE_SOURCE) === sourceIdentity(source) &&
  process.env.GRAIDER_MANAGED_COURSE_RUNTIME
    ? path.resolve(process.env.GRAIDER_MANAGED_COURSE_RUNTIME)
    : source);

/** Only existing generated-output path constructors use this; metadata never does. */
export const courseRuntimePath = (source: string, relative: string): string => {
  const runtime = courseRuntimeRoot(source);
  if (runtime === source) return path.join(source, relative);
  const parts = relative.replaceAll("\\", "/").split("/");
  if (
    path.isAbsolute(relative) ||
    /^[A-Za-z]:/u.test(relative) ||
    parts.some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Unsafe course runtime path.");
  let current = runtime;
  for (const part of ["", ...parts]) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)))
        throw new Error("Unsafe course runtime storage.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const destination = path.join(runtime, ...parts);
  const baseline = path.join(source, ...parts);
  // Seed an existing authoritative generated artifact once; preserve local operation
  // history thereafter. Never read/import the registered legacy folder.
  if (!fs.existsSync(destination) && fs.existsSync(baseline) && fs.lstatSync(baseline).isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(baseline, destination, fs.constants.COPYFILE_EXCL);
  }
  return destination;
};
