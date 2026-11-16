import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runApplyCommand } from "../../src/cli/commands/apply.command.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { OctokitGitHubClient } from "../../src/github/octokit-github-client.js";
import { loadManifest } from "../../src/manifest/manifest-loader.js";
import { APPLY_PHASES, type ApplyPerformance } from "../../src/github/apply-performance.js";
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
const TEMPLATE = "lab04-template";
const ASSIGNMENT = "terms/27s1/assignments/lab04/assignment.yml";
const TOKEN = "ghp_latency_test_secret";
const roots: string[] = [];
const FIRST_REQUESTS_WITH_GRADING = 426;
const FIRST_REQUESTS_WITHOUT_GRADING = 306;
const RESUME_REQUESTS_WITH_GRADING = 246;
const RESUME_REQUESTS_WITHOUT_GRADING = 156;
const FIRST_MS_WITH_GRADING = 38_200;
const FIRST_MS_WITHOUT_GRADING = 26_200;
const RESUME_MS_WITH_GRADING = 20_200;
const RESUME_MS_WITHOUT_GRADING = 11_200;
const READINESS_REQUESTS = 36;
const PERMISSIONS_REQUESTS = 120;
const DEPLOYMENT_REQUESTS = 90;
const FIRST_EXPECTED_MISSING_GRADING = 150;
const FIRST_EXPECTED_MISSING_UNINDEXED = 180;
const FIRST_EXPECTED_MISSING_DISABLED = 90;

type PerformanceSnapshot = ReturnType<ApplyPerformance["snapshot"]>;
const measurements = (summary: Readonly<Record<string, unknown>>): PerformanceSnapshot => {
  const value = summary.githubPerformance;
  if (typeof value !== "object" || value === null)
    throw new Error("Missing performance diagnostics");
  return value as PerformanceSnapshot;
};

/** Real Octokit requests, entirely local transport. Every request costs controllable time. */
class ApplyTransport {
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: LATENCY_MS });
});

describe(
  "Apply latency with 30 students and 100ms per HTTP request",
  { timeout: APPLY_TEST_TIMEOUT_MS },
  () => {
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
      expect(result.errors).toEqual([]);
      expect(result.summary.created).toBe(STUDENTS);
      const first = {
        requests: transport.requests,
        missing: transport.missing,
        elapsedMs: Date.now() - start
      };
      expect(first.requests).toBe(
        grading ? FIRST_REQUESTS_WITH_GRADING : FIRST_REQUESTS_WITHOUT_GRADING
      );
      expect(first.elapsedMs).toBe(grading ? FIRST_MS_WITH_GRADING : FIRST_MS_WITHOUT_GRADING);
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
      expect(profile.phases.repositoryCreation.httpRequests).toBe(DEPLOYMENT_REQUESTS);
      expect(profile.phases.permissions.httpRequests).toBe(PERMISSIONS_REQUESTS);
      expect(profile.phases.actionsConfiguration.httpRequests).toBe(STUDENTS);
      expect(profile.phases.workflowDeployment.httpRequests).toBe(
        grading ? DEPLOYMENT_REQUESTS : 0
      );
      expect(profile.phases.verification.httpRequests).toBe(grading ? STUDENTS : 0);
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
        grading ? RESUME_REQUESTS_WITH_GRADING : RESUME_REQUESTS_WITHOUT_GRADING
      );
      expect(second.elapsedMs).toBe(grading ? RESUME_MS_WITH_GRADING : RESUME_MS_WITHOUT_GRADING);
      expect(transport.peakReads).toBe(GITHUB_READ_CONCURRENCY);
      expect(consoleErrors).not.toHaveBeenCalled();
      process.stdout.write(
        `${JSON.stringify({ grading, indexed, first, second, peakReads: transport.peakReads, peakWrites: transport.peakWrites })}\n`
      );
      expect(transport.peakWrites).toBe(1);
      expect(first.elapsedMs - first.requests * LATENCY_MS).toBe(
        -(2 * (STUDENTS - Math.ceil(STUDENTS / GITHUB_READ_CONCURRENCY)) * LATENCY_MS)
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
  }
);
