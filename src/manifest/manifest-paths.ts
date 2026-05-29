import path from "node:path";

const TERMS_DIRECTORY = "terms";
const MANIFESTS_DIRECTORY = "manifests";
const MANIFEST_FILE_NAME = "manifest.yml";

export interface ManifestPathResult {
  relativeDirectory: string;
  relativePath: string;
  absolutePath: string;
}

export const createManifestPath = (
  repoRoot: string,
  termCode: string,
  assignmentSlug: string
): ManifestPathResult => {
  const relativeDirectory = path.posix.join(
    TERMS_DIRECTORY,
    termCode,
    MANIFESTS_DIRECTORY,
    assignmentSlug
  );
  const relativePath = path.posix.join(relativeDirectory, MANIFEST_FILE_NAME);

  return {
    relativeDirectory,
    relativePath,
    absolutePath: path.join(repoRoot, relativePath)
  };
};
