import { z } from "zod";
import type { LegacyGraderInventory } from "./legacy-grader-models.js";
import type {
  MigrationReviewResult,
  MigrationReviewResultData
} from "./migration-review-models.js";
import { freezeMigrationReview } from "./migration-review-validation.js";

const scope = z.object({ termCode: z.string().min(1), sectionId: z.string().min(1) }).strict();
export const graderAccessSubmissionSchema = z
  .object({
    inventoryId: z.string().min(1),
    decisions: z.array(
      z
        .object({
          githubUserId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          disposition: z.enum(["existing_sufficient", "no_access", "assign"]),
          sections: z.array(scope)
        })
        .strict()
    )
  })
  .strict();
export type GraderAccessSubmission = z.infer<typeof graderAccessSubmissionSchema>;
export interface GraderAccessContext {
  readonly inventoryId: string;
  readonly inventory: LegacyGraderInventory;
  readonly review: MigrationReviewResult;
}

/** Pure additive review. Trusted inputs are retained by main, never supplied by IPC. */
export const reviewGraderAccess = (context: GraderAccessContext, input: unknown) => {
  const { inventory, review } = context;
  const errors: string[] = [];
  const parsed = graderAccessSubmissionSchema.safeParse(input);
  const terms = structuredClone(review.terms) as MigrationReviewResultData["terms"];
  const source = inventory.source;
  if (
    review.status !== "complete" ||
    inventory.status === "blocked" ||
    Object.entries(review.source).some(
      ([key, value]) => source[key as keyof typeof source] !== value
    ) ||
    (inventory.candidate !== null &&
      (!inventory.candidate.membershipComplete || inventory.candidate.teamId === null)) ||
    (inventory.candidate === null && inventory.status !== "not_applicable")
  )
    errors.push("Trusted completed review and complete verified membership are required.");
  if (!parsed.success || parsed.data.inventoryId !== context.inventoryId)
    errors.push("Invalid decisions or replaced inventory. Reload grader access review.");
  const members = inventory.candidate?.members ?? [];
  if (
    new Set(members.map((m) => m.id)).size !== members.length ||
    new Set(members.map((m) => m.login.toLowerCase())).size !== members.length
  )
    errors.push("Conflicting legacy member identities.");
  const directory = review.facultyDirectory;
  if (
    new Set(directory.map((f) => f.github_user_id)).size !== directory.length ||
    new Set(directory.map((f) => f.institutional_username.toLowerCase())).size !==
      directory.length ||
    new Set(directory.map((f) => f.github_login.toLowerCase())).size !== directory.length
  )
    errors.push("Conflicting faculty directory identities.");
  const decisions = parsed.success ? parsed.data.decisions : [];
  if (
    new Set(decisions.map((d) => d.githubUserId)).size !== decisions.length ||
    decisions.some((d) => !members.some((m) => m.id === d.githubUserId))
  )
    errors.push("Duplicate or unknown member decisions.");
  for (const decision of decisions) {
    const existing = review.terms.flatMap((term) =>
      term.sections.filter((section) =>
        section.currentFacultyGithubUserIds?.includes(decision.githubUserId)
      )
    );
    if (decision.disposition === "existing_sufficient" && existing.length === 0)
      errors.push("Existing assignments are required for existing-sufficient disposition.");
    if (decision.disposition === "no_access" && existing.length > 0)
      errors.push("Existing v1 section faculty must be preserved; no-access cannot remove them.");
    if (decision.disposition !== "assign" && decision.sections.length > 0)
      errors.push("Only explicit assignment accepts section scopes.");
    if (decision.disposition === "assign") {
      if (
        !directory.some((f) => f.github_user_id === decision.githubUserId) ||
        decision.sections.length === 0
      )
        errors.push(
          "Explicit assignment requires a verified faculty identity and selected sections."
        );
      const scopes = decision.sections.map((s) => JSON.stringify([s.termCode, s.sectionId]));
      if (new Set(scopes).size !== scopes.length) errors.push("Duplicate section selection.");
      for (const selected of decision.sections) {
        const term = terms.find((t) => t.termCode === selected.termCode);
        const section = term?.sections.find((s) => s.sectionId === selected.sectionId);
        if (!section || section.currentFacultyGithubUserIds === null)
          errors.push("Select an exact reviewed term/section identity.");
        else if (!section.currentFacultyGithubUserIds.includes(decision.githubUserId))
          section.currentFacultyGithubUserIds.push(decision.githubUserId);
      }
    }
  }
  const missingMemberIds = members
    .filter((m) => !decisions.some((d) => d.githubUserId === m.id))
    .map((m) => m.id);
  return freezeMigrationReview({
    kind: "schema-v1-grader-access-review" as const,
    status: errors.length
      ? ("blocked" as const)
      : missingMemberIds.length
        ? ("incomplete" as const)
        : ("complete" as const),
    publicationReady: false as const,
    inventoryId: context.inventoryId,
    source: inventory.source,
    decisions,
    // Invalid proposals never expose changed authorization as usable output.
    terms: errors.length || missingMemberIds.length ? review.terms : terms,
    facultyDirectory: review.facultyDirectory,
    missingMemberIds,
    errors
  });
};
export type GraderAccessReview = ReturnType<typeof reviewGraderAccess>;
