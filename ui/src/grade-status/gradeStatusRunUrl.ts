import type { GradeStatusRepositoryRow } from "./gradeStatusTypes";

const GITHUB_HOST = "github.com";
const ACTIONS_RUN_PATH_SEGMENT_COUNT = 5;
const MINIMUM_RUN_ID = 1;

const isValidRunId = (runId: number | null): runId is number =>
  runId !== null && Number.isSafeInteger(runId) && runId >= MINIMUM_RUN_ID;

const getRepositoryParts = (
  repository: string | null
): { readonly owner: string; readonly repo: string } | null => {
  if (repository === null) {
    return null;
  }

  const parts = repository.split("/");

  if (parts.length !== 2) {
    return null;
  }

  const [owner, repo] = parts;

  return owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0
    ? null
    : { owner, repo };
};

const getRunUrlFromBackend = (row: GradeStatusRepositoryRow): string | null => {
  if (row.runUrl === null) {
    return null;
  }

  const repository = getRepositoryParts(row.repository);

  if (repository === null) {
    return null;
  }

  try {
    const url = new URL(row.runUrl);
    const pathParts = url.pathname.split("/").filter((part) => part.length > 0);
    const [owner, repo, actions, runs, runId] = pathParts;
    const rowRunId = row.runId === null ? null : String(row.runId);

    if (
      url.protocol !== "https:" ||
      url.hostname !== GITHUB_HOST ||
      url.search.length > 0 ||
      url.hash.length > 0 ||
      pathParts.length !== ACTIONS_RUN_PATH_SEGMENT_COUNT ||
      owner !== repository.owner ||
      repo !== repository.repo ||
      actions !== "actions" ||
      runs !== "runs" ||
      runId === undefined ||
      runId.length === 0 ||
      (rowRunId !== null && runId !== rowRunId)
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
};

const buildRunUrl = (row: GradeStatusRepositoryRow): string | null => {
  const repository = getRepositoryParts(row.repository);

  if (repository === null || !isValidRunId(row.runId)) {
    return null;
  }

  return `https://${GITHUB_HOST}/${repository.owner}/${repository.repo}/actions/runs/${String(row.runId)}`;
};

export const getGradeStatusRunUrl = (row: GradeStatusRepositoryRow): string | null =>
  row.runUrl === null ? buildRunUrl(row) : getRunUrlFromBackend(row);
