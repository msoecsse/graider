import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderGradingResultWriterScript } from "../../../src/workflows/result-writer-template.js";

const TEMP_FIXTURE_PREFIX = "graider-result-writer-";
const SCRIPT_FILE = "write-grading-result.py";
const OUTPUT_FILE = "graider-output/grading-results.json";
const SUCCESS_EXIT_CODE = 0;
const SCHEMA_VERSION = 1;
const VALID_STATUSES = ["passed", "failed", "skipped"] as const;

interface GradingResult {
  readonly schema_version: number;
  readonly status: string;
  readonly checks: Array<{
    readonly name: string;
    readonly status: string;
  }>;
}

const createTempRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), TEMP_FIXTURE_PREFIX));

const writeScript = (cwd: string): string => {
  const scriptPath = path.join(cwd, SCRIPT_FILE);

  fs.writeFileSync(scriptPath, renderGradingResultWriterScript());

  return scriptPath;
};

const runWriter = (
  checks: readonly string[],
  options: {
    readonly cwd?: string;
    readonly output?: string;
    readonly env?: Record<string, string | undefined>;
    readonly classroomChecks?: readonly string[];
  } = {}
): {
  readonly result: ReturnType<typeof spawnSync>;
  readonly cwd: string;
  readonly outputPath: string;
} => {
  const cwd = options.cwd ?? createTempRoot();
  const scriptPath = writeScript(cwd);
  const outputPath = options.output ?? OUTPUT_FILE;
  const args = [
    scriptPath,
    "--output",
    outputPath,
    ...checks.flatMap((check) => ["--check", check]),
    ...(options.classroomChecks ?? []).flatMap((check) => ["--classroom-check", check])
  ];
  const result = spawnSync("python3", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env
    }
  });

  return {
    result,
    cwd,
    outputPath
  };
};

const readResult = (cwd: string, outputPath: string): GradingResult =>
  JSON.parse(fs.readFileSync(path.join(cwd, outputPath), "utf8")) as GradingResult;

const expectWriterOutput = (
  checks: readonly string[],
  expected: {
    readonly status: string;
    readonly checks: Array<{ readonly name: string; readonly status: string }>;
  },
  options: {
    readonly env?: Record<string, string | undefined>;
    readonly classroomChecks?: readonly string[];
  } = {}
): void => {
  const { result, cwd, outputPath } = runWriter(checks, options);
  const gradingResult = readResult(cwd, outputPath);

  expect(result.status).toBe(SUCCESS_EXIT_CODE);
  expect(gradingResult.schema_version).toBe(SCHEMA_VERSION);
  expect(gradingResult.status).toBe(expected.status);
  expect(gradingResult.checks).toEqual(expected.checks);
  expect(
    [gradingResult.status, ...gradingResult.checks.map((check) => check.status)].every((status) =>
      VALID_STATUSES.some((validStatus) => validStatus === status)
    )
  ).toBe(true);
};

const encodeClassroomResult = (result: unknown): string =>
  Buffer.from(JSON.stringify(result), "utf8").toString("base64");

const expectClassroomWriterOutput = (
  env: Record<string, string | undefined>,
  expectedStatus: string
): void => {
  expectWriterOutput(
    [],
    {
      status: expectedStatus,
      checks: [{ name: "Classroom Check", status: expectedStatus }]
    },
    {
      env,
      classroomChecks: ["Classroom Check=CLASSROOM_RESULT:CLASSROOM_OUTCOME"]
    }
  );
};

describe("Graider grading result writer template", () => {
  it("maps success/success to overall passed", () => {
    expectWriterOutput(["CheckStyle=success", "Unit Tests=success"], {
      status: "passed",
      checks: [
        { name: "CheckStyle", status: "passed" },
        { name: "Unit Tests", status: "passed" }
      ]
    });
  });

  it("maps success/failure to overall failed", () => {
    expectWriterOutput(["CheckStyle=success", "Unit Tests=failure"], {
      status: "failed",
      checks: [
        { name: "CheckStyle", status: "passed" },
        { name: "Unit Tests", status: "failed" }
      ]
    });
  });

  it("maps failure/success to overall failed", () => {
    expectWriterOutput(["CheckStyle=failure", "Unit Tests=success"], {
      status: "failed",
      checks: [
        { name: "CheckStyle", status: "failed" },
        { name: "Unit Tests", status: "passed" }
      ]
    });
  });

  it("maps skipped/skipped to overall skipped", () => {
    expectWriterOutput(["CheckStyle=skipped", "Unit Tests=skipped"], {
      status: "skipped",
      checks: [
        { name: "CheckStyle", status: "skipped" },
        { name: "Unit Tests", status: "skipped" }
      ]
    });
  });

  it("maps success/skipped to overall passed", () => {
    expectWriterOutput(["CheckStyle=success", "Unit Tests=skipped"], {
      status: "passed",
      checks: [
        { name: "CheckStyle", status: "passed" },
        { name: "Unit Tests", status: "skipped" }
      ]
    });
  });

  it("maps cancelled and unknown outcomes to failed", () => {
    expectWriterOutput(["CheckStyle=cancelled", "Unit Tests=timed_out"], {
      status: "failed",
      checks: [
        { name: "CheckStyle", status: "failed" },
        { name: "Unit Tests", status: "failed" }
      ]
    });
  });

  it("maps Classroom base64 top-level status pass to passed", () => {
    expectClassroomWriterOutput(
      {
        CLASSROOM_RESULT: encodeClassroomResult({
          version: 1,
          status: "pass",
          max_score: 0,
          tests: [{ name: "CheckStyle", status: "pass", score: 0 }]
        }),
        CLASSROOM_OUTCOME: "failure"
      },
      "passed"
    );
  });

  it("maps Classroom base64 top-level status fail to failed", () => {
    expectClassroomWriterOutput(
      {
        CLASSROOM_RESULT: encodeClassroomResult({
          version: 1,
          status: "fail",
          max_score: 0,
          tests: [{ name: "Unit Tests", status: "fail", score: 0 }]
        }),
        CLASSROOM_OUTCOME: "success"
      },
      "failed"
    );
  });

  it("maps Classroom base64 top-level status skip to skipped", () => {
    expectClassroomWriterOutput(
      {
        CLASSROOM_RESULT: encodeClassroomResult({
          version: 1,
          status: "skip",
          tests: [{ name: "Optional Check", status: "skip" }]
        }),
        CLASSROOM_OUTCOME: "success"
      },
      "skipped"
    );
  });

  it("maps Classroom tests containing fail to failed when top-level status is absent", () => {
    expectClassroomWriterOutput(
      {
        CLASSROOM_RESULT: encodeClassroomResult({
          version: 1,
          tests: [
            { name: "One", status: "pass" },
            { name: "Two", status: "fail" }
          ]
        }),
        CLASSROOM_OUTCOME: "success"
      },
      "failed"
    );
  });

  it("maps Classroom tests all pass to passed when top-level status is absent", () => {
    expectClassroomWriterOutput(
      {
        CLASSROOM_RESULT: encodeClassroomResult({
          version: 1,
          tests: [
            { name: "One", status: "pass" },
            { name: "Two", status: "passed" }
          ]
        }),
        CLASSROOM_OUTCOME: "failure"
      },
      "passed"
    );
  });

  it("maps Classroom tests all skipped to skipped when top-level status is absent", () => {
    expectClassroomWriterOutput(
      {
        CLASSROOM_RESULT: encodeClassroomResult({
          version: 1,
          tests: [
            { name: "One", status: "skip" },
            { name: "Two", status: "skipped" }
          ]
        }),
        CLASSROOM_OUTCOME: "success"
      },
      "skipped"
    );
  });

  it("falls back from missing Classroom output to step outcome success", () => {
    expectClassroomWriterOutput({ CLASSROOM_OUTCOME: "success" }, "passed");
  });

  it("falls back from missing Classroom output to step outcome failure", () => {
    expectClassroomWriterOutput({ CLASSROOM_OUTCOME: "failure" }, "failed");
  });

  it("falls back from missing Classroom output to step outcome skipped", () => {
    expectClassroomWriterOutput({ CLASSROOM_OUTCOME: "skipped" }, "skipped");
  });

  it("falls back from unparseable Classroom output to step outcome success", () => {
    expectClassroomWriterOutput(
      {
        CLASSROOM_RESULT: "not-base64-json",
        CLASSROOM_OUTCOME: "success"
      },
      "passed"
    );
  });

  it("falls back from unparseable Classroom output and missing outcome to failed", () => {
    expectClassroomWriterOutput({ CLASSROOM_RESULT: "not-base64-json" }, "failed");
  });

  it("maps missing outcomes to failed and preserves check names with spaces", () => {
    expectWriterOutput(["Style Review=", "Unit Tests"], {
      status: "failed",
      checks: [
        { name: "Style Review", status: "failed" },
        { name: "Unit Tests", status: "failed" }
      ]
    });
  });

  it("creates output parent directories and writes parseable JSON", () => {
    const { result, cwd, outputPath } = runWriter(["CheckStyle=success"], {
      output: "nested/output/grading-results.json"
    });
    const gradingResult = readResult(cwd, outputPath);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(gradingResult).toMatchObject({
      schema_version: SCHEMA_VERSION,
      status: "passed"
    });
  });

  it("uses overall skipped for no checks", () => {
    const { result, cwd, outputPath } = runWriter([]);
    const gradingResult = readResult(cwd, outputPath);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(gradingResult).toEqual({
      schema_version: SCHEMA_VERSION,
      status: "skipped",
      checks: []
    });
  });

  it("exits nonzero when output is missing", () => {
    const cwd = createTempRoot();
    const scriptPath = writeScript(cwd);
    const result = spawnSync("python3", [scriptPath, "--check", "CheckStyle=success"], {
      cwd,
      encoding: "utf8"
    });

    expect(result.status).not.toBe(SUCCESS_EXIT_CODE);
  });
});
