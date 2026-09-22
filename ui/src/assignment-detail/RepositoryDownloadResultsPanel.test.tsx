import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AssignmentRepositoryDownloadResult } from "../../electron/ipc";
import { RepositoryDownloadResultsPanel } from "./RepositoryDownloadResultsPanel";

describe("RepositoryDownloadResultsPanel", () => {
  it("renders the clone summary, destination, and each target's repository and local path", () => {
    const result: AssignmentRepositoryDownloadResult = {
      status: "success",
      destination: "/Users/sean/Downloads/lab02",
      repositoryMode: "individual",
      totalTargets: 2,
      clonedCount: 2,
      failedCount: 0,
      targets: [
        {
          targetId: "student-alpha",
          repositoryName: "27s1-csc1120-lab02-alpha",
          localPath: "/Users/sean/Downloads/lab02/27s1-csc1120-lab02-alpha",
          status: "cloned",
          studentIds: ["alpha"],
          githubUsernames: ["alpha-gh"],
          diagnostics: []
        }
      ],
      diagnostics: []
    };

    render(<RepositoryDownloadResultsPanel result={result} />);

    expect(
      screen.getByText("2 cloned, 0 failed of 2. Destination: /Users/sean/Downloads/lab02")
    ).toBeInTheDocument();
    expect(screen.getByText("27s1-csc1120-lab02-alpha")).toBeInTheDocument();
    expect(
      screen.getByText("/Users/sean/Downloads/lab02/27s1-csc1120-lab02-alpha", { exact: false })
    ).toBeInTheDocument();
  });

  it("renders target and command-level diagnostics as alerts", () => {
    const result: AssignmentRepositoryDownloadResult = {
      status: "partial_success",
      destination: "/Users/sean/Downloads/lab02",
      repositoryMode: "individual",
      totalTargets: 1,
      clonedCount: 0,
      failedCount: 1,
      targets: [
        {
          targetId: "student-beta",
          repositoryName: "27s1-csc1120-lab02-beta",
          localPath: "/Users/sean/Downloads/lab02/27s1-csc1120-lab02-beta",
          status: "failed",
          studentIds: ["beta"],
          githubUsernames: ["beta-gh"],
          diagnostics: [{ message: "Destination folder already exists; left unchanged." }]
        }
      ],
      diagnostics: [{ message: "One repository could not be downloaded." }]
    };

    render(<RepositoryDownloadResultsPanel result={result} />);

    expect(screen.getByText("One repository could not be downloaded.")).toBeInTheDocument();
    expect(
      screen.getByText("Destination folder already exists; left unchanged.")
    ).toBeInTheDocument();
  });
});
