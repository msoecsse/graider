import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginAuthoritativeLegacyCliMutation,
  endAuthoritativeLegacyCliMutation
} from "../../src/execution/authoritative-legacy-course.js";
import { runApplyCommand } from "../../src/cli/commands/apply.command.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { OctokitGitHubClient } from "../../src/github/octokit-github-client.js";
import { loadManifest } from "../../src/manifest/manifest-loader.js";
import {
  APPLY_PHASES,
  measureApplyPhase,
  withApplyPerformance,
  type ApplyPerformance
} from "../../src/github/apply-performance.js";
import { GITHUB_READ_CONCURRENCY } from "../../src/github/bounded-github-reads.js";
import { createManifestPath } from "../../src/manifest/manifest-paths.js";

const STUDENTS = 30;
const APPLY_TEST_TIMEOUT_MS = 60_000;
const LATENCY_MS = 100;
const OK = 200;
const CREATED = 201;
const EMPTY = 204;
const MISSING = 404;
const FORBIDDEN = 403;
const UNAUTHORIZED = 401;
const READINESS_DELAY_MS = 3_000;
const PROPAGATION_BACKOFF_MS = 7_000;
const TEMPLATE = "lab04-template";
const COURSE = "se2030-graider";
const AUTHORITY_FIRST_REQUESTS = 1212;
const AUTHORITY_RESUME_REQUESTS = 282;
const AUTHORITY_FIRST_MS = 80_500;
const AUTHORITY_RESUME_MS = 23_500;
const AUTHORITY_REQUESTS_PER_VALIDATION = 6;
const WRITES_PER_STUDENT = 4;
const ASSIGNMENT = "terms/27s1/assignments/lab04/assignment.yml";
const TOKEN = "ghp_latency_test_secret";
const roots: string[] = [];
const FIRST_REQUESTS_WITH_GRADING = 486;
const FIRST_REQUESTS_WITHOUT_GRADING = 336;
const RESUME_REQUESTS_WITH_GRADING = 276;
const RESUME_REQUESTS_WITHOUT_GRADING = 156;
const FIRST_MS_WITH_GRADING = 44_200;
const FIRST_MS_WITHOUT_GRADING = 29_200;
const RESUME_MS_WITH_GRADING = 23_200;
const RESUME_MS_WITHOUT_GRADING = 11_200;
const READINESS_REQUESTS = 36;
const PERMISSIONS_REQUESTS = 180;
const CREATION_REQUESTS = 60;
const DEPLOYMENT_REQUESTS = 90;
const FIRST_EXPECTED_MISSING_GRADING = 150;
const FIRST_EXPECTED_MISSING_UNINDEXED = 270;
const UNINDEXED_FIRST_REQUESTS = 546;
const UNINDEXED_FIRST_MS = 260_200;
const UNINDEXED_RESUME_REQUESTS = 246;
const UNINDEXED_RESUME_MS = 20_200;
const FIRST_EXPECTED_MISSING_DISABLED = 90;

// Measured at b40becc before this change; includes initial validation in readiness.
const AUTHORITY_BEFORE = {
  first: { requests: 1394, elapsedMs: 135_000, authorityRequests: 968 },
  resume: { requests: 254, elapsedMs: 21_000, authorityRequests: 8 }
};
const AUTHORITY_FIRST_PHASES = {
  readiness: { beforeRequests: 44, beforeMs: 2200, requests: 42, ms: 1700 },
  planning: { beforeRequests: 30, beforeMs: 800, requests: 30, ms: 800 },
  repositoryCreation: { beforeRequests: 330, beforeMs: 33_000, requests: 240, ms: 15_000 },
  permissions: { beforeRequests: 600, beforeMs: 60_000, requests: 540, ms: 36_000 },
  actionsConfiguration: { beforeRequests: 30, beforeMs: 3000, requests: 30, ms: 3000 },
  workflowDeployment: { beforeRequests: 330, beforeMs: 33_000, requests: 270, ms: 18_000 },
  verification: { beforeRequests: 30, beforeMs: 3000, requests: 60, ms: 6000 }
};
const AUTHORITY_RESUME_PHASES = {
  ...AUTHORITY_FIRST_PHASES,
  repositoryCreation: { beforeRequests: 0, beforeMs: 0, requests: 0, ms: 0 },
  permissions: { beforeRequests: 60, beforeMs: 6000, requests: 60, ms: 6000 },
  workflowDeployment: { beforeRequests: 60, beforeMs: 6000, requests: 60, ms: 6000 }
};

type PerformanceSnapshot = ReturnType<ApplyPerformance["snapshot"]>;
const measurements = (summary: Readonly<Record<string, unknown>>): PerformanceSnapshot => {
  const value = summary.githubPerformance;
  if (typeof value !== "object" || value === null)
    throw new Error("Missing performance diagnostics");
  return value as PerformanceSnapshot;
};

/** Real Octokit requests, entirely local transport. Every request costs controllable time. */
class ApplyTransport {
  readonly calls: string[] = [];
  readonly failures = new Map<string, number[]>();
  readonly readiness = new Map<string, { delayMs: number; readyAt?: number }>();
  courseContent: string | undefined;
  workflowWriteForbidden = false;
  requests = 0;
  missing = 0;
  activeReads = 0;
  peakReads = 0;
  activeWrites = 0;
  peakWrites = 0;
  readonly repositories = new Set<string>([TEMPLATE]);
  readonly files = new Map<string, string>();
  readonly permissions = new Set<string>();

  constructor(readonly indexed: boolean) {}

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    );
    const method = init?.method ?? "GET";
    const operation = `${method} ${url.pathname}`;
    this.calls.push(operation);
    const read = method === "GET";
    this.requests += 1;
    this.activeReads += read ? 1 : 0;
    this.activeWrites += read ? 0 : 1;
    this.peakReads = Math.max(this.peakReads, this.activeReads);
    this.peakWrites = Math.max(this.peakWrites, this.activeWrites);
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    this.activeReads -= read ? 1 : 0;
    this.activeWrites -= read ? 0 : 1;
    const parts = url.pathname.split("/");
    const repo = parts[3] ?? "";
    const route = parts.slice(4).join("/");
    const reply = (data: unknown, status = OK): Response => {
      if (status === MISSING) this.missing += 1;
      return new Response(status === EMPTY ? null : JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" }
      });
    };
    const failure = this.failures.get(operation)?.shift();
    if (failure !== undefined) return reply({ message: "Injected endpoint failure" }, failure);
    const readiness = this.readiness.get(operation);
    if (readiness !== undefined) {
      readiness.readyAt ??= Date.now() + readiness.delayMs;
      if (Date.now() < readiness.readyAt) return reply({ message: "Not Found" }, MISSING);
    }
    if (url.pathname === "/user") return reply({ login: "faculty", id: 1 });
    if (url.pathname.startsWith("/users/")) return reply({ login: parts[2], id: 1 });
    if (url.pathname === "/orgs/example-org/teams/faculty")
      return reply({ slug: "faculty", name: "Faculty" });
    if (url.pathname.includes("/teams/faculty/repos/")) {
      if (!read) this.permissions.add(url.pathname);
      return reply({ permission: "admin" }, this.permissions.has(url.pathname) ? OK : MISSING);
    }
    if (route === "generate") {
      const body: unknown = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
      const name: unknown =
        typeof body === "object" && body !== null ? Reflect.get(body, "name") : undefined;
      if (typeof name !== "string") throw new Error("Expected repository name");
      this.repositories.add(name);
      return reply(this.metadata(name), CREATED);
    }
    if (!this.repositories.has(repo)) return reply({ message: "Not Found" }, MISSING);
    if (route === "") return reply(this.metadata(repo));
    if (route === "branches") return reply([{ name: "main" }]);
    if (route === "commits") return reply([{ sha: "baseline-sha" }]);
    if (route === "contents") return reply([{ name: "README.md" }]);
    if (route.startsWith("collaborators/")) {
      const key = `${repo}/collaborator`;
      if (!read) this.permissions.add(key);
      return reply({ permission: "admin" }, this.permissions.has(key) ? OK : MISSING);
    }
    if (route === "actions/permissions") return reply({ enabled: true });
    if (repo === COURSE && route === "contents/course.yml" && this.courseContent !== undefined)
      return reply({
        content: Buffer.from(this.courseContent).toString("base64"),
        encoding: "base64"
      });
    if (route.startsWith("contents/")) {
      if (!read) {
        if (this.workflowWriteForbidden) return reply({ message: "Forbidden" }, FORBIDDEN);
        const body: unknown = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
        const content: unknown =
          typeof body === "object" && body !== null ? Reflect.get(body, "content") : undefined;
        if (typeof content !== "string") throw new Error("Expected content");
        this.files.set(repo, content);
        return reply({ content: { path: route }, commit: { sha: "workflow-sha" } }, CREATED);
      }
      const content = this.files.get(repo);
      return content === undefined
        ? reply({ message: "Not Found" }, MISSING)
        : reply({ content, encoding: "base64", sha: "blob-sha" });
    }
    if (route.startsWith("actions/workflows/"))
      return this.indexed
        ? reply({ id: 1, path: ".github/workflows/grade.yml", state: "active" })
        : reply({ message: "Not Found" }, MISSING);
    throw new Error(`Unhandled fake route: ${method} ${url.pathname}`);
  };

  private metadata(name: string): object {
    return {
      id: name === TEMPLATE ? 1 : [...this.repositories].indexOf(name) + 1,
      owner: { login: "example-org" },
      name,
      full_name: `example-org/${name}`,
      private: true,
      archived: false,
      default_branch: "main",
      html_url: `https://github.com/example-org/${name}`,
      is_template: name === TEMPLATE
    };
  }
}

const fixture = (grading: boolean): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-apply-latency-"));
  roots.push(root);
  fs.cpSync("tests/fixtures/apply/grading-disabled", root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "terms/27s1/rosters/section-001.csv"),
    [
      "student_id,github_username,section,status",
      ...Array.from(
        { length: STUDENTS },
        (_, index) => `s${String(index)},student${String(index)},001,active`
      )
    ].join("\n")
  );
  if (grading) {
    const assignmentPath = path.join(root, ASSIGNMENT);
    fs.writeFileSync(
      assignmentPath,
      fs
        .readFileSync(assignmentPath, "utf8")
        .replace(
          "  enabled: false",
          "  enabled: true\n  mode: preset\n  preset: java-junit-checkstyle\n  workflow: .github/workflows/grade.yml\n  artifact: grading-results\n  result_file: results.json"
        )
    );
  }
  return root;
};

afterEach(() => {
  endAuthoritativeLegacyCliMutation();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: LATENCY_MS });
});

describe(
  "Apply latency with 30 students and 100ms per HTTP request",
  { timeout: APPLY_TEST_TIMEOUT_MS },
  () => {
    it("waits through a three-second Actions and workflow propagation delay, exceeding the former retry window", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "performance"] });
      const transport = new ApplyTransport(true);
      const repo = "27s1-se2030-lab04-student0";
      const actions = `GET /repos/example-org/${repo}/actions/permissions`;
      const workflow = `GET /repos/example-org/${repo}/actions/workflows/grade.yml`;
      transport.readiness.set(actions, { delayMs: READINESS_DELAY_MS });
      transport.readiness.set(workflow, { delayMs: READINESS_DELAY_MS });
      vi.stubGlobal("fetch", transport.fetch);
      const pending = runApplyCommand({
        cwd: fixture(true),
        assignmentFile: ASSIGNMENT,
        options: normalizeCommonCommandOptions({ yes: true }),
        githubClient: new OctokitGitHubClient({ token: TOKEN })
      });
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(result.errors).toEqual([]);
      expect(transport.calls.filter((call) => call === actions)).toHaveLength(3);
      expect(transport.calls.filter((call) => call === workflow)).toHaveLength(3);
      expect(result.summary.created).toBe(STUDENTS);
    });

    it.each(["transient", "persistent", "forbidden", "unauthorized", "workflow"] as const)(
      "attributes post-create %s failures to their exact endpoint and retains durable creation",
      async (scenario) => {
        vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "performance"] });
        const transport = new ApplyTransport(true);
        const repo = "27s1-se2030-lab04-student0";
        const actions = `GET /repos/example-org/${repo}/actions/permissions`;
        const workflow = `GET /repos/example-org/${repo}/actions/workflows/grade.yml`;
        transport.failures.set(
          actions,
          scenario === "forbidden" || scenario === "unauthorized"
            ? [scenario === "forbidden" ? FORBIDDEN : UNAUTHORIZED]
            : scenario === "workflow"
              ? []
              : Array.from({ length: scenario === "persistent" ? 4 : 3 }, () => MISSING)
        );
        if (scenario === "transient" || scenario === "workflow")
          transport.failures.set(
            workflow,
            Array.from({ length: scenario === "workflow" ? 4 : 2 }, () => MISSING)
          );
        vi.stubGlobal("fetch", transport.fetch);
        const cwd = fixture(true);
        const pending = runApplyCommand({
          cwd,
          assignmentFile: ASSIGNMENT,
          options: normalizeCommonCommandOptions({ yes: true }),
          githubClient: new OctokitGitHubClient({ token: TOKEN })
        });
        await vi.runAllTimersAsync();
        const result = await pending;
        expect(result.summary.created).toBe(STUDENTS);
        const outcomes = result.summary.repositories as {
          status: string;
          diagnostics: { context?: Record<string, unknown> }[];
        }[];
        expect(outcomes[0]?.status).toBe("created");
        const checkpoint = loadManifest(createManifestPath(cwd, "27s1", "lab04").absolutePath);
        expect(checkpoint.manifest?.repositories).toHaveLength(STUDENTS);
        expect(transport.calls.filter((call) => call === actions)).toHaveLength(
          scenario === "forbidden" || scenario === "unauthorized" || scenario === "workflow" ? 1 : 4
        );
        if (scenario === "transient") {
          expect(result.errors).toEqual([]);
          expect(transport.calls.filter((call) => call === workflow)).toHaveLength(3);
          expect(checkpoint.manifest?.repositories[0]?.actions).toMatchObject({
            enabled: true,
            gradingWorkflowFound: true,
            workflowDispatchSupported: true
          });
        } else {
          expect(result.status).toBe("partial_success");
          expect(
            outcomes[0]?.diagnostics.some(
              (diagnostic) =>
                diagnostic.context?.operationType ===
                  (scenario === "workflow" ? "verify_grading_workflow" : "enable_actions") &&
                diagnostic.context.endpoint ===
                  (scenario === "workflow"
                    ? "/repos/{owner}/{repo}/actions/workflows/{workflow_id}"
                    : "/repos/{owner}/{repo}/actions/permissions")
            )
          ).toBe(true);
        }
        expect(transport.peakWrites).toBe(1);
        expect(JSON.stringify(result)).not.toContain(TOKEN);
        if (scenario === "persistent" || scenario === "workflow") {
          const resume = runApplyCommand({
            cwd,
            assignmentFile: ASSIGNMENT,
            options: normalizeCommonCommandOptions({ yes: true }),
            githubClient: new OctokitGitHubClient({ token: TOKEN })
          });
          await vi.runAllTimersAsync();
          const recovered = await resume;
          expect(recovered.errors).toEqual([]);
          expect(recovered.summary.created).toBe(0);
          expect(transport.repositories.size).toBe(STUDENTS + 1);
        }
      }
    );
    it.each([
      { grading: false, indexed: false },
      { grading: true, indexed: true },
      { grading: true, indexed: false }
    ])("measures new and resumed Apply: %j", async ({ grading, indexed }) => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "performance"] });
      const consoleErrors = vi.spyOn(console, "error");
      const transport = new ApplyTransport(indexed);
      vi.stubGlobal("fetch", transport.fetch);
      const cwd = fixture(grading);
      const request = {
        cwd,
        assignmentFile: ASSIGNMENT,
        options: normalizeCommonCommandOptions({ yes: true }),
        githubClient: new OctokitGitHubClient({ token: TOKEN })
      };
      const start = Date.now();
      const pending = runApplyCommand(request);
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(result.errors).toHaveLength(grading && !indexed ? STUDENTS * 2 : 0);
      expect(result.summary.created).toBe(STUDENTS);
      const first = {
        requests: transport.requests,
        missing: transport.missing,
        elapsedMs: Date.now() - start
      };
      expect(first.requests).toBe(
        grading
          ? indexed
            ? FIRST_REQUESTS_WITH_GRADING
            : UNINDEXED_FIRST_REQUESTS
          : FIRST_REQUESTS_WITHOUT_GRADING
      );
      expect(first.elapsedMs).toBe(
        grading ? (indexed ? FIRST_MS_WITH_GRADING : UNINDEXED_FIRST_MS) : FIRST_MS_WITHOUT_GRADING
      );
      expect(first.missing).toBe(
        grading
          ? indexed
            ? FIRST_EXPECTED_MISSING_GRADING
            : FIRST_EXPECTED_MISSING_UNINDEXED
          : FIRST_EXPECTED_MISSING_DISABLED
      );
      const profile = measurements(result.summary);
      expect(profile.elapsedMs).toBe(first.elapsedMs);
      expect(profile.phases.readiness.httpRequests).toBe(READINESS_REQUESTS);
      expect(profile.phases.readiness.elapsedMs).toBe(
        (READINESS_REQUESTS - STUDENTS + Math.ceil(STUDENTS / GITHUB_READ_CONCURRENCY)) * LATENCY_MS
      );
      expect(profile.phases.planning.httpRequests).toBe(STUDENTS);
      expect(profile.phases.planning.elapsedMs).toBe(
        Math.ceil(STUDENTS / GITHUB_READ_CONCURRENCY) * LATENCY_MS
      );
      expect(profile.phases.repositoryCreation.httpRequests).toBe(CREATION_REQUESTS);
      expect(profile.phases.permissions.httpRequests).toBe(PERMISSIONS_REQUESTS);
      expect(profile.phases.actionsConfiguration.httpRequests).toBe(STUDENTS);
      expect(profile.phases.workflowDeployment.httpRequests).toBe(
        grading ? DEPLOYMENT_REQUESTS : 0
      );
      expect(profile.phases.verification.httpRequests).toBe(
        grading ? STUDENTS * (indexed ? 2 : 4) : 0
      );
      expect(
        APPLY_PHASES.reduce((count, phase) => count + profile.phases[phase].httpRequests, 0)
      ).toBe(first.requests);
      expect(
        APPLY_PHASES.reduce(
          (count, phase) => count + profile.phases[phase].expectedMissingResponses,
          0
        )
      ).toBe(first.missing);
      expect(APPLY_PHASES.every((phase) => profile.phases[phase].failedResponses === 0)).toBe(true);
      const resumeStart = Date.now();
      const resumed = runApplyCommand(request);
      await vi.runAllTimersAsync();
      const resume = await resumed;
      expect(resume.summary.created).toBe(0);
      expect(resume.errors.length).toBe(grading && !indexed ? STUDENTS * 2 : 0);
      const second = {
        requests: transport.requests - first.requests,
        missing: transport.missing - first.missing,
        elapsedMs: Date.now() - resumeStart
      };
      expect(second.requests).toBe(
        grading
          ? indexed
            ? RESUME_REQUESTS_WITH_GRADING
            : UNINDEXED_RESUME_REQUESTS
          : RESUME_REQUESTS_WITHOUT_GRADING
      );
      expect(second.elapsedMs).toBe(
        grading
          ? indexed
            ? RESUME_MS_WITH_GRADING
            : UNINDEXED_RESUME_MS
          : RESUME_MS_WITHOUT_GRADING
      );
      expect(transport.peakReads).toBe(GITHUB_READ_CONCURRENCY);
      expect(consoleErrors).not.toHaveBeenCalled();
      process.stdout.write(
        `${JSON.stringify({ grading, indexed, first, second, peakReads: transport.peakReads, peakWrites: transport.peakWrites })}\n`
      );
      expect(transport.peakWrites).toBe(1);
      expect(first.elapsedMs - first.requests * LATENCY_MS).toBe(
        -(2 * (STUDENTS - Math.ceil(STUDENTS / GITHUB_READ_CONCURRENCY)) * LATENCY_MS) +
          (grading && !indexed ? STUDENTS * PROPAGATION_BACKOFF_MS : 0)
      );
      const manifest = loadManifest(createManifestPath(cwd, "27s1", "lab04").absolutePath);
      expect(manifest.status).toBe("loaded");
      if (manifest.status === "loaded")
        expect(manifest.manifest.repositories).toHaveLength(STUDENTS);
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });
    it("blocks every write when a concurrent planning read finds an untracked collision", async () => {
      vi.useFakeTimers();
      const transport = new ApplyTransport(true);
      transport.repositories.add("27s1-se2030-lab04-student17");
      vi.stubGlobal("fetch", transport.fetch);
      const pending = runApplyCommand({
        cwd: fixture(true),
        assignmentFile: ASSIGNMENT,
        options: normalizeCommonCommandOptions({ yes: true }),
        githubClient: new OctokitGitHubClient({ token: TOKEN })
      });
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "repo_name_collision" })
      );
      expect(transport.peakWrites).toBe(0);
      expect(transport.repositories.size).toBe(2);
      expect(measurements(result.summary).phases.planning.httpRequests).toBe(STUDENTS);
    });

    it("checkpoints workflow-write failures and recovers on a new Apply without recreating repositories", async () => {
      vi.useFakeTimers();
      const transport = new ApplyTransport(true);
      transport.workflowWriteForbidden = true;
      vi.stubGlobal("fetch", transport.fetch);
      const cwd = fixture(true);
      const request = {
        cwd,
        assignmentFile: ASSIGNMENT,
        options: normalizeCommonCommandOptions({ yes: true }),
        githubClient: new OctokitGitHubClient({ token: TOKEN })
      };
      const pending = runApplyCommand(request);
      await vi.runAllTimersAsync();
      const partial = await pending;
      expect(partial.summary.created).toBe(STUDENTS);
      expect(partial.errors).toHaveLength(STUDENTS);
      expect(measurements(partial.summary).phases.workflowDeployment.failedResponses).toBe(
        STUDENTS
      );
      expect(measurements(partial.summary).phases.verification.httpRequests).toBe(0);
      const checkpoint = loadManifest(createManifestPath(cwd, "27s1", "lab04").absolutePath);
      expect(checkpoint.status).toBe("loaded");
      if (checkpoint.status === "loaded")
        expect(checkpoint.manifest.repositories).toHaveLength(STUDENTS);
      transport.workflowWriteForbidden = false;
      const resumed = runApplyCommand(request);
      await vi.runAllTimersAsync();
      const recovered = await resumed;
      expect(recovered.errors).toEqual([]);
      expect(recovered.summary.created).toBe(0);
      expect(transport.repositories.size).toBe(STUDENTS + 1);
      expect(transport.files.size).toBe(STUDENTS);
      expect(transport.peakWrites).toBe(1);
    });
    it("measures Apply including real authoritative validation before every write", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "performance"] });
      const transport = new ApplyTransport(true);
      transport.repositories.add(COURSE);
      vi.stubGlobal("fetch", transport.fetch);
      const cwd = fixture(true);
      transport.courseContent = fs.readFileSync(path.join(cwd, "course.yml"), "utf8");
      const githubClient = new OctokitGitHubClient({ token: TOKEN });
      const run = () =>
        withApplyPerformance(async () => {
          await measureApplyPhase("readiness", () =>
            beginAuthoritativeLegacyCliMutation({
              root: cwd,
              client: githubClient,
              remoteUrl: `https://github.com/example-org/${COURSE}.git`,
              localRevision: "baseline-sha"
            })
          );
          return runApplyCommand({
            cwd,
            assignmentFile: ASSIGNMENT,
            options: normalizeCommonCommandOptions({ yes: true }),
            githubClient
          });
        });
      const start = Date.now();
      const pending = run();
      await vi.runAllTimersAsync();
      const first = await pending;
      expect(first.errors).toEqual([]);
      expect(first.summary.created).toBe(STUDENTS);
      expect(transport.requests).toBe(AUTHORITY_FIRST_REQUESTS);
      expect(Date.now() - start).toBe(AUTHORITY_FIRST_MS);
      const firstRequests = transport.requests;
      const authorityRequests = firstRequests - FIRST_REQUESTS_WITH_GRADING;
      expect(authorityRequests).toBe(
        AUTHORITY_REQUESTS_PER_VALIDATION * (STUDENTS * WRITES_PER_STUDENT + 1)
      );
      const resumeStart = Date.now();
      const resumed = run();
      await vi.runAllTimersAsync();
      const second = await resumed;
      expect(second.errors).toEqual([]);
      expect(second.summary.created).toBe(0);
      expect(transport.requests - firstRequests).toBe(AUTHORITY_RESUME_REQUESTS);
      expect(Date.now() - resumeStart).toBe(AUTHORITY_RESUME_MS);
      expect(transport.peakWrites).toBe(1);
      expect(transport.peakReads).toBe(GITHUB_READ_CONCURRENCY);
      for (const [result, expected] of [
        [first, AUTHORITY_FIRST_PHASES],
        [second, AUTHORITY_RESUME_PHASES]
      ] as const) {
        const profile = measurements(result.summary);
        expect(profile.elapsedMs).toBe(result === first ? AUTHORITY_FIRST_MS : AUTHORITY_RESUME_MS);
        expect(APPLY_PHASES.reduce((sum, phase) => sum + profile.phases[phase].elapsedMs, 0)).toBe(
          profile.elapsedMs
        );
        for (const phase of APPLY_PHASES) {
          expect(profile.phases[phase].httpRequests, phase).toBe(expected[phase].requests);
          expect(profile.phases[phase].elapsedMs, phase).toBe(expected[phase].ms);
          expect(profile.phases[phase].failedResponses, phase).toBe(0);
        }
      }
      process.stdout.write(
        `${JSON.stringify({ authority: true, before: AUTHORITY_BEFORE, phases: { first: AUTHORITY_FIRST_PHASES, resume: AUTHORITY_RESUME_PHASES }, first: { requests: firstRequests, authorityRequests, elapsedMs: AUTHORITY_FIRST_MS, profile: measurements(first.summary) }, second: { requests: transport.requests - firstRequests, elapsedMs: Date.now() - resumeStart, profile: measurements(second.summary) } })}\n`
      );
    });
  }
);
