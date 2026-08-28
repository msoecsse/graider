import { describe, expect, it, vi } from "vitest";
import { getAssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";

const response = JSON.stringify({
  schemaVersion: 1,
  commandName: "assignment repository-mappings",
  manifest: { status: "present" },
  studentMappings: [
    {
      studentId: "ada",
      githubUsername: "ada",
      targetId: "ada",
      repositoryName: "lab-ada",
      repositoryUrl: "https://github.com/example/lab-ada"
    }
  ],
  diagnostics: []
});

describe("assignment repository mappings runner", () => {
  it("uses fixed argv and parses safe local mapping JSON", async () => {
    const runner = vi
      .fn()
      .mockResolvedValue({ stdout: response, stderr: "", exitCode: 0, error: null });
    const result = await getAssignmentRepositoryMappings({
      courseFolderPath: "/tmp/Course Folder",
      assignmentFile: "terms/27s1/assignments/lab/assignment.yml",
      runner
    });
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "graider",
        args: [
          "assignment",
          "repository-mappings",
          "terms/27s1/assignments/lab/assignment.yml",
          "--json"
        ],
        cwd: "/tmp/Course Folder"
      })
    );
    expect(result.mappings[0]?.repositoryUrl).toContain("lab-ada");
  });

  it("rejects traversal and invalid JSON without exposing runner output", async () => {
    const runner = vi.fn();
    const traversal = await getAssignmentRepositoryMappings({
      courseFolderPath: "/tmp/course",
      assignmentFile: "../outside.yml",
      runner
    });
    expect(runner).not.toHaveBeenCalled();
    expect(traversal.diagnostics[0]?.message).toContain("outside");
    const malformed = await getAssignmentRepositoryMappings({
      courseFolderPath: "/tmp/course",
      assignmentFile: "terms/27s1/assignments/lab/assignment.yml",
      runner: vi
        .fn()
        .mockResolvedValue({ stdout: "not json", stderr: "token", exitCode: 1, error: null })
    });
    expect(JSON.stringify(malformed)).not.toContain("token");
  });
});
