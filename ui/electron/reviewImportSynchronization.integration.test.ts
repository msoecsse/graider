// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { exec as executeDugite } from "dugite";
import { afterEach, expect, it } from "vitest";
import { createReviewImportService } from "./reviewImportService.js";
import {
  type RepositoryUpdateBackend,
  createGradingStudentRepositoryUpdateService
} from "./gradingStudentRepositoryUpdateService.js";
import type { AuthenticatedGitWorkspaceContext } from "./gitWorkspaceReader.js";
import type * as Backend from "../dist-electron/reviewImportBackend.cjs";
import { removeGitFixture, describeGitIntegration } from "./gitIntegrationFixtures.js";
const load = createRequire(path.join(process.cwd(), "package.json"));
const backend = load("./dist-electron/reviewImportBackend.cjs") as typeof Backend;
type Command = { cwd: string; args: readonly string[]; env?: NodeJS.ProcessEnv };
type Runners = {
  runGit(command: Command): Promise<string>;
  runGitBinary(command: Command): Promise<{ stdout: Uint8Array; stderr: Uint8Array }>;
};
const { createAuthenticatedDugiteGitWorkspace } = load(
  "./dist-electron/dugiteGitWorkspaceBackend.cjs"
) as {
  createAuthenticatedDugiteGitWorkspace(
    token: string,
    runners: Runners
  ): AuthenticatedGitWorkspaceContext;
};
const repositoryUpdateBackend = load(
  "./dist-electron/gradingStudentRepositoryUpdateBackend.cjs"
) as RepositoryUpdateBackend;
const repair = load("./dist-electron/gradingStudentWorkflowRepairBackend.cjs") as {
  executePreparedGradingStudentWorkflowRepair(
    prepared: unknown,
    client: unknown,
    confirmed: boolean,
    overrides: unknown,
    run: boolean
  ): Promise<unknown>;
};
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const source = "class Main {\n    input.trim();\n}\n";
const remoteUrl = "https://github.com/example-org/27s1-se2030-lab04-seanjones.git";
const fixture = async (mode = "success") => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-review-sync-"));
  roots.push(root);
  const remote = path.join(root, "remote.git"),
    studentRoot = path.join(root, "student"),
    local = path.join(root, "faculty student"),
    course = path.join(root, "course");
  const execute = async (command: Command) => {
    const result = await executeDugite([...command.args], command.cwd, {
      encoding: "buffer",
      ...(command.env === undefined ? {} : { env: command.env })
    });
    if (result.exitCode !== 0) throw new Error("Synthetic Git command failed");
    return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
  };
  const git = async (cwd: string, ...args: string[]) =>
    Buffer.from(
      (
        await execute({
          cwd,
          args: [
            "-c",
            "core.autocrlf=false",
            "-c",
            "user.name=Faculty",
            "-c",
            "user.email=faculty@example.test",
            "-c",
            "commit.gpgsign=false",
            ...args
          ],
          env: { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "no-global-config") }
        })
      ).stdout
    )
      .toString("utf8")
      .trim();
  await git(root, "init", "--bare", remote);
  await git(root, "clone", remote, studentRoot);
  await git(studentRoot, "checkout", "-b", "main");
  fs.writeFileSync(path.join(studentRoot, "Main.java"), source);
  await git(studentRoot, "add", "Main.java");
  await git(studentRoot, "commit", "-m", "Initial student submission");
  await git(studentRoot, "push", "-u", "origin", "main");
  await git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
  await git(root, "clone", remote, local);
  const originalSha = await git(local, "rev-parse", "HEAD");
  await git(local, "remote", "set-url", "origin", remoteUrl);
  fs.cpSync(path.resolve("../tests/fixtures/roster/valid-course"), course, { recursive: true });
  fs.appendFileSync(
    path.join(course, "terms/27s1/assignments/lab04/assignment.yml"),
    "\ngrading:\n  enabled: true\n  mode: preset\n  preset: java-junit-checkstyle\n  workflow: .github/workflows/grade.yml\n  artifact: grading-results\n  result_file: grading-results.json\n  required_files:\n    - Main.java\n  rubric:\n    - id: design\n      name: Design\n      points: 10\n"
  );
  const manifestPath = path.join(course, "terms/27s1/manifests/lab04/manifest.yml");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.copyFileSync(
    path.resolve("../tests/fixtures/manifest/valid-manifest/manifest.yml"),
    manifestPath
  );
  const statePath = path.join(course, ".graider/grading/27s1/lab04/state/jones.json");
  const state = {
    schemaVersion: 1,
    studentId: "jones",
    submissionCommitSha: originalSha,
    status: "published",
    finalScoreOverride: 0,
    appliedComments: [
      {
        id: "existing",
        text: "Faculty edited feedback",
        deduction: 2,
        sourceLocation: { file: "Main.java", startLine: 2, endLine: 2 },
        sourceAnchor: {
          status: "relocated",
          originalCommitSha: originalSha,
          originalLocation: { file: "Main.java", startLine: 2, endLine: 2 },
          originalText: "    input.trim();"
        },
        importProvenance: {
          source: "review_import",
          schemaVersion: 1,
          reviewId: "review",
          findingId: "existing"
        }
      }
    ],
    manualAdjustments: [
      { id: "note", rubricCategoryId: "design", amount: 0, note: "Instructor note" }
    ],
    viewState: { scrollTop: 12, cursor: { file: "Main.java", line: 2, column: 1 } }
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state));
  const readState = () => JSON.parse(fs.readFileSync(statePath, "utf8")) as typeof state;
  fs.writeFileSync(path.join(local, "faculty-notes.txt"), "Preserve local bytes");
  if (mode !== "exact") {
    fs.writeFileSync(path.join(studentRoot, "review.txt"), "Externally reviewed submission");
    await git(studentRoot, "add", "review.txt");
    await git(studentRoot, "commit", "-m", "Submission reviewed externally");
    await git(studentRoot, "push");
  }
  let reviewedSha = await git(studentRoot, "rev-parse", "HEAD");
  if (mode === "absent") reviewedSha = "f".repeat(40);
  if (mode === "student changes") {
    fs.writeFileSync(path.join(studentRoot, "Main.java"), `// Added header\n${source}`);
    await git(studentRoot, "commit", "-am", "Student resubmission");
    await git(studentRoot, "push");
  }
  if (mode === "administrative") {
    // Generate from the same trusted config used by the production import adapter.
    let content: string | undefined;
    const repository = {
      owner: "example-org",
      name: "27s1-se2030-lab04-seanjones",
      defaultBranch: "main",
      fullName: "example-org/27s1-se2030-lab04-seanjones"
    };
    await repair.executePreparedGradingStudentWorkflowRepair(
      {
        studentId: "jones",
        repository,
        grading: {
          enabled: true,
          mode: "preset",
          preset: "java-junit-checkstyle",
          rubric: [{ id: "design", name: "Design", points: 10 }]
        }
      },
      {
        getRepository: async () => repository,
        getRepositoryFileContent: async () => null,
        writeRepositoryFile: async (request: { content: string }) => {
          content = request.content;
          return { commitSha: originalSha };
        }
      },
      true,
      {},
      false
    );
    if (content === undefined) throw new Error("Missing generated workflow fixture");
    fs.mkdirSync(path.join(studentRoot, ".github/workflows"), { recursive: true });
    fs.writeFileSync(path.join(studentRoot, ".github/workflows/grade.yml"), content);
    await git(studentRoot, "add", ".github/workflows/grade.yml");
    await git(studentRoot, "commit", "-m", "Configure Graider grading workflow");
    await git(studentRoot, "push");
  }
  if (mode === "conflict") fs.writeFileSync(path.join(local, "review.txt"), "Local faculty work");
  if (mode === "diverged") {
    fs.writeFileSync(path.join(local, "local-only.txt"), "Local-only commit");
    await git(local, "add", "local-only.txt");
    await git(local, "commit", "-m", "Local-only work");
    state.submissionCommitSha = await git(local, "rev-parse", "HEAD");
    fs.writeFileSync(statePath, JSON.stringify(state));
  }
  const initialHead = await git(local, "rev-parse", "HEAD");
  const review = {
    schemaVersion: 1,
    reviewId: "review",
    assignment: { courseCode: "se2030", termCode: "27s1", assignmentSlug: "lab04" },
    student: { studentId: "jones", githubUsername: "seanjones" },
    repository: {
      owner: "example-org",
      name: "27s1-se2030-lab04-seanjones",
      reviewedCommitSha: reviewedSha
    },
    findings: [
      {
        id: "new",
        title: "New feedback",
        deduction: 1,
        rubric: { id: "design" },
        sourceLocation: {
          file: "Main.java",
          startLine: 2,
          endLine: 2,
          excerpt: "    input.trim();"
        }
      },
      { id: "existing", title: "Preserve existing feedback", deduction: 1 }
    ]
  };
  const input = path.join(root, "review.json");
  fs.writeFileSync(input, JSON.stringify(review));
  const student = { studentId: "jones", githubUsername: "seanjones", section: "001" };
  let authorized = true,
    fetches = 0,
    observations = 0;
  let afterFetch: (() => Promise<void>) | undefined;
  const runners: Runners = {
    runGitBinary: execute,
    runGit: async (command) => {
      const fetching = command.args.includes("fetch");
      if (fetching) {
        fetches += 1;
        expect(command.args).toContain("refs/heads/main");
        expect(command.args).not.toContain(reviewedSha);
        if (mode === "remote unavailable") throw { kind: "remote_unavailable" };
      }
      if (command.args.includes("ls-remote")) observations += 1;
      const response = Buffer.from(
        (
          await execute({
            ...command,
            args: command.args.map((arg) => (arg === remoteUrl ? remote : arg))
          })
        ).stdout
      ).toString("utf8");
      if (fetching) {
        if (mode === "authorization changed") authorized = false;
        if (mode === "repository changed")
          fs.writeFileSync(
            manifestPath,
            fs
              .readFileSync(manifestPath, "utf8")
              .replaceAll("27s1-se2030-lab04-seanjones", "different-repository")
          );
        if (mode === "remote changed") {
          fs.writeFileSync(
            path.join(studentRoot, "review.txt"),
            "Remote advanced during synchronization"
          );
          await git(studentRoot, "commit", "-am", "Concurrent remote change");
          await git(studentRoot, "push");
        }
        await afterFetch?.();
      }
      if (command.args.includes("merge") && mode === "grading changed") {
        const current = readState();
        current.manualAdjustments.push({
          id: "concurrent",
          rubricCategoryId: "design",
          amount: 0,
          note: "Concurrent faculty note"
        });
        fs.writeFileSync(statePath, JSON.stringify(current));
      }
      return response;
    }
  };
  const authenticate = async () =>
    mode === "authentication unavailable"
      ? null
      : createAuthenticatedDugiteGitWorkspace("synthetic-token", runners);
  const scope = () => ({
    status: "success" as const,
    students: authorized ? [student] : [],
    sections: ["001"],
    errors: []
  });
  const repository = () => ({ status: "success" as const, localPath: local });
  const service = createReviewImportService({
    backend: () => backend,
    scope,
    repository,
    showOpenDialog: async () => ({ canceled: false, filePaths: [input] }),
    synchronize: (request, proof, revalidate) =>
      createGradingStudentRepositoryUpdateService({
        authenticate,
        loadBackend: () => repositoryUpdateBackend,
        resolveFacultyScope: scope,
        resolveRepository: repository,
        reviewImport: proof,
        revalidate
      })(request)
  });
  const request = {
    courseFolderId: "course",
    courseFolderPath: course,
    termCode: "27s1",
    assignmentSlug: "lab04",
    userDataPath: root
  };
  const preview = async (owner = 1) => {
    const value = await service.choose(request, owner);
    if (value === null) throw new Error("Missing preview");
    expect(JSON.stringify(value)).not.toContain("synthetic-token");
    if (value.synchronization === undefined && value.plan.reviews[0]?.shaState === undefined)
      throw new Error(JSON.stringify(value.plan.reviews[0]?.diagnostics));
    return value;
  };
  const apply = (value: Backend.ImportPreview, approved = false) =>
    service.apply(
      {
        ...request,
        planId: value.planId,
        version: 1,
        selections: [
          {
            reviewIndex: 0,
            studentId: "jones",
            findingKey: value.plan.reviews[0]?.findings[0]?.key ?? '["review","new"]',
            approved
          }
        ]
      },
      1
    );
  return {
    preview,
    apply,
    readState,
    state,
    local,
    root,
    originalSha,
    reviewedSha,
    initialHead,
    git,
    input,
    statePath,
    service,
    request,
    counts: () => ({ fetches, observations }),
    setAfterFetch: (hook: () => Promise<void>) => {
      afterFetch = hook;
    }
  };
};

describeGitIntegration("Review Import uses authenticated student repository updates", () => {
  it.each(["success", "administrative", "student changes"])(
    "synchronizes stale local history, replans %s, and preserves faculty work",
    async (mode) => {
      const f = await fixture(mode);
      const preview = await f.preview();
      expect(f.counts(), JSON.stringify(preview.synchronization)).toEqual({
        fetches: 1,
        observations: 1
      });
      expect(preview.synchronization?.[0]?.status).toBe("success");
      const currentSha = await f.git(f.local, "rev-parse", "HEAD");
      expect(preview.plan.reviews[0]).toMatchObject({
        currentCommitSha: currentSha,
        shaState:
          mode === "administrative"
            ? "administrative"
            : mode === "student changes"
              ? "changed"
              : "exact"
      });
      expect(preview.plan.reviews[0]?.review?.repository.reviewedCommitSha).toBe(f.reviewedSha);
      expect(preview.plan.reviews[0]?.findings[1]?.duplicate).toBe(true);
      const current = f.readState();
      expect(current).toMatchObject({
        status: "published",
        finalScoreOverride: 0,
        submissionCommitSha: currentSha,
        manualAdjustments: f.state.manualAdjustments,
        viewState: f.state.viewState
      });
      expect(current.appliedComments[0]).toMatchObject({
        text: "Faculty edited feedback",
        deduction: 2,
        importProvenance: f.state.appliedComments[0]?.importProvenance,
        sourceAnchor: { originalCommitSha: f.originalSha, originalText: "    input.trim();" }
      });
      expect(fs.readFileSync(path.join(f.local, "faculty-notes.txt"), "utf8")).toBe(
        "Preserve local bytes"
      );
      if (mode === "student changes") {
        expect(current.appliedComments[0]?.sourceLocation.startLine).toBe(3);
        expect(await f.apply(preview)).toMatchObject({ applied: 0, failed: 1 });
        expect(await f.apply(preview, true)).toMatchObject({ applied: 1 });
      } else expect(await f.apply(preview)).toMatchObject({ applied: 1, failed: 0 });
      expect(f.counts().fetches).toBe(1);
    }
  );
  it("keeps ordinary exact-match imports entirely local", async () => {
    const f = await fixture("exact");
    const preview = await f.preview();
    expect(preview.plan.reviews[0]?.shaState).toBe("exact");
    expect(await f.apply(preview)).toMatchObject({ applied: 1 });
    expect(f.counts()).toEqual({ fetches: 0, observations: 0 });
  });
  it.each([
    "absent",
    "conflict",
    "diverged",
    "authentication unavailable",
    "remote unavailable",
    "authorization changed",
    "repository changed",
    "remote changed",
    "grading changed"
  ])("blocks %s without losing local or faculty work", async (mode) => {
    const f = await fixture(mode);
    const preview = await f.preview();
    expect(preview.synchronization?.[0]?.status).toBe("failed");
    expect(
      preview.plan.reviews
        .flatMap((review) => review.findings)
        .every((finding) => !finding.eligibleToApply)
    ).toBe(true);
    expect(await f.apply(preview, true)).toMatchObject({ applied: 0, failed: 1 });
    expect(f.counts().fetches).toBeLessThanOrEqual(1);
    if (mode === "grading changed") {
      expect(f.readState().submissionCommitSha).toBe(f.originalSha);
      expect(f.readState().manualAdjustments.at(-1)?.note).toBe("Concurrent faculty note");
    } else {
      expect(await f.git(f.local, "rev-parse", "HEAD")).toBe(f.initialHead);
      expect(f.readState()).toEqual(f.state);
    }
    expect(fs.readFileSync(path.join(f.local, "faculty-notes.txt"), "utf8")).toBe(
      "Preserve local bytes"
    );
    if (mode === "conflict")
      expect(fs.readFileSync(path.join(f.local, "review.txt"), "utf8")).toBe("Local faculty work");
  });
  it("refuses concurrent synchronization through the shared update lifecycle", async () => {
    const f = await fixture();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.setAfterFetch(async () => {
      entered();
      await gate;
    });
    const first = f.preview();
    await Promise.race([
      started,
      first.then(() => {
        throw new Error("Synchronization finished before the fetch gate");
      })
    ]);
    try {
      const second = await f.preview(2);
      expect(second.synchronization?.[0]).toMatchObject({
        status: "failed",
        message: expect.stringContaining("already running")
      });
    } finally {
      release();
    }
    expect((await first).synchronization?.[0]?.status).toBe("success");
    expect(f.counts().fetches).toBe(1);
  });
  it.each(["repository", "submission"])(
    "rejects a changed %s after synchronized preview",
    async (mode) => {
      const f = await fixture();
      const preview = await f.preview();
      if (mode === "repository")
        await f.git(f.local, "remote", "set-url", "origin", "https://github.com/other/repo.git");
      else {
        fs.writeFileSync(path.join(f.local, "new.txt"), "Concurrent local commit");
        await f.git(f.local, "add", "new.txt");
        await f.git(f.local, "commit", "-m", "Concurrent submission change");
      }
      expect(await f.apply(preview, true)).toMatchObject({ applied: 0, failed: 1 });
      expect(f.readState().appliedComments).toHaveLength(1);
    }
  );
});
