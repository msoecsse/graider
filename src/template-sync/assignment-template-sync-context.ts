import path from "node:path";
import { loadGraiderConfig } from "../config/config-loader.js";
import { parseTemplateRepository } from "../config/github-config-validation.js";
import { resolveAssignmentPath, toRepositoryRelativePath } from "../core/paths.js";
import { evaluateMutationGuard } from "../execution/mutation-guard.js";
import { createGitHubClient, readGitHubToken } from "../github/github-client-factory.js";
import { loadManifest } from "../manifest/manifest-loader.js";
import { createManifestPath } from "../manifest/manifest-paths.js";
import { writeManifest } from "../manifest/manifest-renderer.js";
import { isApplicableRepository } from "./assignment-template-sync.js";
import { runProductionAssignmentTemplateSyncService } from "./production-assignment-template-sync-service.js";
import type {
  AssignmentTemplateSyncService,
  AssignmentTemplateSyncRequest,
  TemplateSyncBlocker,
  AssignmentTemplateSyncAvailability,
  AssignmentTemplateSyncOutcome
} from "../../ui/electron/assignmentTemplateSyncService.js";

export interface AssignmentTemplateSyncContextDependencies {
  loadConfig: typeof loadGraiderConfig;
  loadManifest: typeof loadManifest;
  writeManifest: typeof writeManifest;
  createClient: typeof createGitHubClient;
  resolveToken: (request: AssignmentTemplateSyncRequest) => string | undefined;
  runSync: typeof runProductionAssignmentTemplateSyncService;
}

const defaults: AssignmentTemplateSyncContextDependencies = {
  loadConfig: loadGraiderConfig,
  loadManifest,
  writeManifest,
  createClient: createGitHubClient,
  resolveToken: (request) => {
    const injected = (
      request as AssignmentTemplateSyncRequest & { readonly resolvedGithubToken?: string }
    ).resolvedGithubToken?.trim();
    return injected === undefined || injected.length === 0 ? readGitHubToken() : injected;
  },
  runSync: runProductionAssignmentTemplateSyncService
};

const unavailable = (code: string, message: string): AssignmentTemplateSyncAvailability => ({
  available: false,
  repositoryCount: 0,
  templateRepository: null,
  recordedTemplateRevision: null,
  blocker: { code, message }
});

/** Internal main-process backend; all public data is explicitly projected. */
export const createAssignmentTemplateSyncContextService = (
  overrides: Partial<AssignmentTemplateSyncContextDependencies> = {}
): AssignmentTemplateSyncService => {
  const dependencies = { ...defaults, ...overrides };
  const loadContext = (request: AssignmentTemplateSyncRequest) => {
    // Same course-folder + canonical relative assignment path used by Assignment Edit.
    const relative = toRepositoryRelativePath(
      request.courseFolderPath,
      resolveAssignmentPath(request.courseFolderPath, request.assignmentFile)
    );
    if (
      !/^terms\/\d{2}s[123]\/assignments\/[A-Za-z0-9][A-Za-z0-9._-]*\/assignment\.yml$/u.test(
        relative
      )
    ) {
      return {
        preview: unavailable(
          "invalid_assignment",
          "Select a valid assignment in this course folder."
        )
      };
    }
    const loaded = dependencies.loadConfig({
      cwd: request.courseFolderPath,
      assignmentFile: request.assignmentFile
    });
    if (loaded.status === "failure")
      return {
        preview: unavailable(
          "invalid_assignment",
          "Unable to load assignment configuration. Check the course, term, and assignment files."
        )
      };
    const { config } = loaded;
    if (path.resolve(config.summary.repoRoot) !== path.resolve(request.courseFolderPath)) {
      return {
        preview: unavailable(
          "invalid_assignment",
          "Assignment does not belong to the selected course folder."
        )
      };
    }
    const template = config.assignment.template;
    if (template === undefined || template.repository.trim().length === 0)
      return {
        preview: unavailable(
          "template_required",
          "Configure an assignment template before updating repositories."
        )
      };
    const parsed = parseTemplateRepository(config.course.github.organization, template.repository);
    if (parsed.status === "failure")
      return {
        preview: unavailable("invalid_template", "Configure the template as owner/repository.")
      };
    const manifestPath = createManifestPath(
      config.summary.repoRoot,
      config.summary.termCode,
      config.summary.assignmentSlug
    ).absolutePath;
    const loadedManifest = dependencies.loadManifest(manifestPath, { required: true });
    if (loadedManifest.status !== "loaded")
      return {
        preview: unavailable(
          "manifest_required",
          "Assignment manifest is missing or unreadable. Apply the assignment before updating repositories."
        )
      };
    const manifest = loadedManifest.manifest;
    if (manifest.schemaVersion !== 1)
      return {
        preview: unavailable(
          "unsupported_manifest",
          "This manifest format does not yet support template-sync anchor persistence."
        )
      };
    if (
      manifest.assignment.assignmentSlug !== config.summary.assignmentSlug ||
      manifest.assignment.termCode !== config.summary.termCode ||
      manifest.assignment.courseCode !== config.course.course.code ||
      manifest.template?.repository !== template.repository
    ) {
      return {
        preview: unavailable(
          "manifest_mismatch",
          "The manifest does not match this assignment and template. Check the assignment configuration."
        )
      };
    }
    const repositoryCount = manifest.repositories.filter((record) =>
      isApplicableRepository(record, manifest)
    ).length;
    const preview: AssignmentTemplateSyncAvailability = {
      available: repositoryCount > 0,
      repositoryCount,
      templateRepository: template.repository,
      recordedTemplateRevision: manifest.template.commitSha ?? null,
      ...(repositoryCount === 0
        ? {
            blocker: {
              code: "no_repositories",
              message: "No applicable student repositories. Apply the assignment first."
            }
          }
        : {})
    };
    return {
      preview,
      context: {
        config,
        manifest,
        manifestPath,
        template: parsed.repository,
        templateConfig: template
      }
    };
  };

  return {
    prepare(request) {
      try {
        return Promise.resolve(loadContext(request).preview);
      } catch {
        return Promise.resolve(
          unavailable(
            "invalid_assignment",
            "Unable to load assignment context. Check the assignment path and files."
          )
        );
      }
    },
    async execute(request) {
      const options = { yes: request.confirmed, json: false, verbose: false };
      const guard = evaluateMutationGuard({ options });
      if (!guard.allowed)
        return {
          status: "failure",
          outcomes: [],
          blocker: {
            code: "confirmation_required",
            message: "Confirm the template update before executing."
          }
        };
      try {
        const { preview, context } = loadContext(request);
        if (!preview.available || context === undefined)
          return {
            status: "failure",
            outcomes: [],
            ...(preview.blocker === undefined ? {} : { blocker: preview.blocker })
          };
        let token: string | undefined;
        let client: ReturnType<typeof createGitHubClient>;
        try {
          token = dependencies.resolveToken(request);
          if (token === undefined) throw new Error("GitHub token is required.");
          client = dependencies.createClient({ token });
        } catch {
          return {
            status: "failure",
            outcomes: [],
            blocker: {
              code: "github_token_required",
              message: "Configure a token or sign in with GitHub CLI before updating repositories."
            }
          };
        }
        const response = await dependencies.runSync({
          configuredOrganization: context.config.course.github.organization,
          configuredTemplateRepository: context.templateConfig.repository,
          resolvedToken: token,
          manifest: context.manifest,
          options,
          workspace: { githubClient: client },
          resolveCurrentTemplateCommitSha: async () => {
            const template = await client.getTemplateRepository(
              context.template.owner,
              context.template.repo
            );
            if (
              template === null ||
              template.defaultBranch !== context.templateConfig.branch ||
              !template.latestCommitSha ||
              template.latestCommitSha === "unknown"
            ) {
              throw new Error("Unable to resolve the configured template default branch.");
            }
            return template.latestCommitSha;
          },
          persistManifest: (manifest) => {
            const written = dependencies.writeManifest(context.manifestPath, manifest);
            if (written.status === "failure")
              throw new Error("Unable to save assignment sync state.");
            return Promise.resolve();
          }
        });
        if (response.status === "failure")
          return {
            status: "failure",
            outcomes: [],
            blocker: {
              code: "template_sync_failed",
              message:
                "Unable to start template sync. Check GitHub authentication and template configuration."
            }
          };
        const result = response.result;
        const outcomes: AssignmentTemplateSyncOutcome[] = result.outcomes.map(
          ({ studentId, result: item }) => {
            const status =
              item.status === "failure" || item.status === "conflict"
                ? "failed"
                : item.status === "pull_request_reconciled"
                  ? "updated"
                  : item.status;
            const failure = item.status === "failure" ? item.failure : undefined;
            return {
              studentId,
              status,
              ...("pullRequest" in item
                ? { pullRequest: { number: item.pullRequest.number, url: item.pullRequest.url } }
                : {}),
              ...(status === "failed"
                ? {
                    ...(failure === undefined ? {} : { failureStage: failure.stage }),
                    message:
                      failure?.message ??
                      "Unable to update this repository. Retry, then check the assignment configuration if it continues."
                  }
                : item.status === "baseline_required" && item.message !== undefined
                  ? { message: item.message }
                  : {})
            };
          }
        );
        const blocker: TemplateSyncBlocker | undefined =
          result.status === "failure" || result.status === "blocked"
            ? {
                code:
                  result.status === "failure" && result.failure !== undefined
                    ? result.failure.stage
                    : "template_sync_failed",
                message:
                  result.status === "failure" && result.failure !== undefined
                    ? result.failure.message
                    : "Unable to synchronize repositories. Check template configuration and repository access."
              }
            : result.persistenceError !== undefined
              ? {
                  code: "manifest_write_failed",
                  message:
                    "Repository operations completed, but sync state could not be saved. Check manifest permissions before retrying."
                }
              : undefined;
        return {
          status:
            blocker !== undefined
              ? "failure"
              : result.status === "completed_with_failures"
                ? "partial_success"
                : "success",
          outcomes,
          ...(blocker === undefined ? {} : { blocker })
        };
      } catch {
        return {
          status: "failure",
          outcomes: [],
          blocker: {
            code: "template_sync_failed",
            message:
              "Unable to synchronize this assignment. Check its configuration and repository access."
          }
        };
      }
    }
  };
};

export const assignmentTemplateSyncContextService = createAssignmentTemplateSyncContextService();
