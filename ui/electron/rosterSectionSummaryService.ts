import path from "node:path";
import type { RosterSectionSummariesRequest, RosterSectionSummariesResult } from "./ipc.js";

interface RosterSectionSummaryBackend {
  resolveRosterSectionSummariesContext(request: {
    readonly courseFolderPath: string;
    readonly termCode: string;
  }): RosterSectionSummariesResult;
}

export interface RosterSectionSummaryServiceDependencies {
  readonly backend: RosterSectionSummaryBackend;
}

const loadBackend = (): RosterSectionSummaryBackend =>
  require(path.join(__dirname, "rosterSectionSummaryBackend.cjs")) as RosterSectionSummaryBackend;

export const createRosterSectionSummaryService = (
  dependencies: Partial<RosterSectionSummaryServiceDependencies> = {}
): ((request: RosterSectionSummariesRequest) => RosterSectionSummariesResult) => {
  const backend = dependencies.backend ?? loadBackend();
  return (request) =>
    backend.resolveRosterSectionSummariesContext({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode
    });
};

export const getRosterSectionSummaries = (
  request: RosterSectionSummariesRequest
): RosterSectionSummariesResult => createRosterSectionSummaryService()(request);
