import fs from "node:fs";
import path from "node:path";

const GRAIDER_COMMAND = "graider";
const GRAIDER_PACKAGE_NAME = "graider";
const PACKAGE_MANIFEST_FILE = "package.json";
const TEXT_ENCODING = "utf8";
const WINDOWS_PATH_SEPARATOR = ";";
const DEFAULT_PATH_EXTENSIONS = ".COM;.EXE;.BAT;.CMD";
const DIRECTLY_SPAWNABLE_EXTENSIONS = [".com", ".exe"] as const;

export type WindowsGraiderCliLocation =
  | {
      readonly kind: "executable";
      readonly executablePath: string;
    }
  | {
      readonly kind: "node_script";
      readonly scriptPath: string;
    };

export interface WindowsGraiderCliResolverOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fileExists?: (candidatePath: string) => boolean;
  readonly readFile?: (filePath: string) => string;
}

interface PackageManifest {
  readonly bin?: string | Record<string, string>;
}

const readEnvironmentValue = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const matchingKey = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());

  return matchingKey === undefined ? undefined : env[matchingKey];
};

const splitWindowsList = (value: string | undefined): readonly string[] =>
  (value ?? "")
    .split(WINDOWS_PATH_SEPARATOR)
    .map((entry) => entry.trim().replace(/^"(.*)"$/u, "$1"))
    .filter((entry) => entry.length > 0);

/** Lower cased because Windows filenames are case insensitive and npm writes its shims lower cased. */
const getPathExtensions = (env: NodeJS.ProcessEnv): readonly string[] => {
  const configured = splitWindowsList(readEnvironmentValue(env, "PATHEXT"));

  return (configured.length > 0 ? configured : splitWindowsList(DEFAULT_PATH_EXTENSIONS)).map(
    (extension) => (extension.startsWith(".") ? extension : `.${extension}`).toLowerCase()
  );
};

const isDirectlySpawnable = (extension: string): boolean =>
  DIRECTLY_SPAWNABLE_EXTENSIONS.includes(
    extension.toLowerCase() as (typeof DIRECTLY_SPAWNABLE_EXTENSIONS)[number]
  );

const findShimOnPath = (
  env: NodeJS.ProcessEnv,
  fileExists: (candidatePath: string) => boolean
): string | null => {
  const pathExtensions = getPathExtensions(env);

  for (const directory of splitWindowsList(readEnvironmentValue(env, "PATH"))) {
    for (const extension of pathExtensions) {
      const candidate = path.join(directory, `${GRAIDER_COMMAND}${extension}`);

      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
};

const parsePackageManifest = (contents: string): PackageManifest | null => {
  try {
    return JSON.parse(contents) as PackageManifest;
  } catch {
    return null;
  }
};

const getManifestBinEntry = (manifest: PackageManifest): string | null => {
  if (typeof manifest.bin === "string") {
    return manifest.bin;
  }

  if (typeof manifest.bin === "object" && manifest.bin !== null) {
    return manifest.bin[GRAIDER_COMMAND] ?? null;
  }

  return null;
};

/**
 * npm writes its shims next to the package tree, so the installed entry point lives either at
 * `<shimDir>/node_modules/graider` (global installs) or `<shimDir>/../graider` (a `node_modules/.bin` shim).
 */
const getPackageDirectoryCandidates = (shimPath: string): readonly string[] => {
  const shimDirectory = path.dirname(shimPath);

  return [
    path.join(shimDirectory, "node_modules", GRAIDER_PACKAGE_NAME),
    path.join(path.dirname(shimDirectory), GRAIDER_PACKAGE_NAME)
  ];
};

const resolveScriptFromShim = (
  shimPath: string,
  fileExists: (candidatePath: string) => boolean,
  readFile: (filePath: string) => string
): string | null => {
  for (const packageDirectory of getPackageDirectoryCandidates(shimPath)) {
    const manifestPath = path.join(packageDirectory, PACKAGE_MANIFEST_FILE);

    if (!fileExists(manifestPath)) {
      continue;
    }

    const manifest = parsePackageManifest(readFile(manifestPath));

    if (manifest === null) {
      continue;
    }

    const binEntry = getManifestBinEntry(manifest);

    if (binEntry === null) {
      continue;
    }

    const scriptPath = path.join(packageDirectory, binEntry);

    if (fileExists(scriptPath)) {
      return scriptPath;
    }
  }

  return null;
};

/**
 * Windows has no `graider.exe`; npm installs a `graider.cmd` shim instead. Node refuses to spawn
 * `.cmd`/`.bat` files without a shell (CVE-2024-27980), and its PATH search no longer falls back to
 * those extensions, so spawning the bare `graider` command fails with ENOENT even when it is on PATH.
 * Resolving the shim to the JavaScript file it launches lets the caller run it under Node directly,
 * keeping argument arrays escaped instead of resorting to `shell: true`.
 */
export const resolveWindowsGraiderCli = ({
  env = process.env,
  fileExists = fs.existsSync,
  readFile = (filePath) => fs.readFileSync(filePath, TEXT_ENCODING)
}: WindowsGraiderCliResolverOptions = {}): WindowsGraiderCliLocation | null => {
  const shimPath = findShimOnPath(env, fileExists);

  if (shimPath === null) {
    return null;
  }

  if (isDirectlySpawnable(path.extname(shimPath))) {
    return {
      kind: "executable",
      executablePath: shimPath
    };
  }

  const scriptPath = resolveScriptFromShim(shimPath, fileExists, readFile);

  return scriptPath === null ? null : { kind: "node_script", scriptPath };
};
