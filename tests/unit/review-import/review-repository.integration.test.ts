import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createDugiteGitRunners } from "../../../src/git/dugite-git-runners.js";
import { createDugiteGitWorkspaceFactory } from "../../../src/git/dugite-git-workspace-context.js";
import { createReviewRepositoryReader } from "../../../src/review-import/review-repository.js";
import { planReviewImport } from "../../../src/review-import/review-planner.js";
import { renderJavaJunitCheckstyleWorkflow } from "../../../src/workflows/java-junit-checkstyle-workflow.js";
import {
  describeGitIntegration,
  removeGitFixture
} from "../../support/git/integration-fixtures.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
describeGitIntegration("Review Import with actual bundled Git objects", () => {
  it("distinguishes instructor workflow deployment from student resubmissions and ambiguous recovery", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-review-import-"));
    roots.push(root);
    const runner = createDugiteGitRunners();
    const git = async (...args: string[]) =>
      (
        await runner.runGit({
          cwd: root,
          args: [
            "-c",
            "user.name=Faculty",
            "-c",
            "user.email=faculty@example.test",
            "-c",
            "core.autocrlf=false",
            "-c",
            "commit.gpgsign=false",
            ...args
          ],
          env: {
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: path.join(root, "no-global-config"),
            GIT_ATTR_NOSYSTEM: "1"
          }
        })
      ).trim();
    await git("init");
    await git("remote", "add", "origin", "https://github.com/example-org/repo.git");
    const source = "class Main {\n    input.trim();\n}\n";
    fs.writeFileSync(path.join(root, "Main.java"), source);
    await git("add", "Main.java");
    await git("commit", "-m", "Student submission");
    const reviewedSha = await git("rev-parse", "HEAD");
    const canonicalWorkflow = renderJavaJunitCheckstyleWorkflow({
      grading: { enabled: true, mode: "preset", preset: "java-junit-checkstyle" }
    });
    fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(path.join(root, ".github", "workflows", "grade.yml"), canonicalWorkflow);
    await git("add", ".github/workflows/grade.yml");
    await git("commit", "-m", "Configure Graider grading workflow");
    const workspace = await createDugiteGitWorkspaceFactory().open(root);
    const reader = createReviewRepositoryReader(workspace, canonicalWorkflow);
    const assignment = { courseCode: "CS1021", termCode: "27s1", assignmentSlug: "lab1" };
    const review = {
      schemaVersion: 1,
      reviewId: "review",
      assignment,
      student: { studentId: "ada", githubUsername: "ada-gh" },
      repository: { owner: "example-org", name: "repo", reviewedCommitSha: reviewedSha },
      findings: [
        {
          id: "source",
          title: "Handle input",
          deduction: 2,
          rubric: { id: "code" },
          sourceLocation: {
            file: "Main.java",
            startLine: 2,
            endLine: 2,
            excerpt: "    input.trim();"
          }
        },
        { id: "general", title: "Documentation", deduction: 1 }
      ]
    };
    const plan = async () =>
      planReviewImport([{ filename: "review.json", content: JSON.stringify(review) }], {
        assignment,
        rubric: [{ id: "code", name: "Code", points: 10 }],
        repository: () => Promise.resolve(reader),
        submissions: [
          {
            student: { studentId: "ada", githubUsername: "ada-gh" },
            repository: { owner: "example-org", name: "repo" },
            currentCommitSha: await git("rev-parse", "HEAD"),
            gradingState: null,
            diagnostics: []
          }
        ]
      });
    const administrative = await plan();
    expect(administrative.reviews[0]).toMatchObject({
      shaState: "administrative",
      status: "ready"
    });
    expect(administrative.reviews[0]?.review?.repository.reviewedCommitSha).toBe(reviewedSha);
    expect(
      administrative.reviews[0]?.findings.every(
        (finding) => finding.eligibleToApply && !finding.requiresApproval
      )
    ).toBe(true);
    fs.writeFileSync(path.join(root, "Main.java"), `// Student header\n${source}`);
    await git("commit", "-am", "Student resubmission");
    const resubmission = await plan();
    expect(resubmission.reviews[0]).toMatchObject({ shaState: "changed", status: "warning" });
    expect(resubmission.reviews[0]?.findings[0]).toMatchObject({
      requiresApproval: true,
      recoveryRequired: true,
      anchor: { status: "recoverable", proposed: { startLine: 3 } }
    });
    expect(resubmission.reviews[0]?.findings[1]).toMatchObject({
      requiresApproval: true,
      recoveryRequired: true
    });
    fs.writeFileSync(path.join(root, "Main.java"), source + source);
    await git("commit", "-am", "Student duplicated context");
    expect((await plan()).reviews[0]?.findings[0]).toMatchObject({
      eligibleToApply: false,
      anchor: { status: "unresolved" }
    });
  });
});
