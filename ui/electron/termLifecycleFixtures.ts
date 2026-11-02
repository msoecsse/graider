import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { vi, expect, type Mock } from "vitest";
import type { TermActivationRequest } from "./termActivationService";
import type { GitWorkspaceSynchronizer } from "./gitWorkspaceReader";
import {
  managedOperationalFixture,
  fixtureGit as git,
  fixtureCourseYaml
} from "./managedOperationalFixtures";

export interface TermLifecycleFixture extends Awaited<
  ReturnType<typeof managedOperationalFixture>
> {
  readonly request: TermActivationRequest;
  readonly reconcile: Mock<NonNullable<TermActivationRequest["reconcile"]>>;
  readonly observed: Awaited<ReturnType<NonNullable<TermActivationRequest["reconcile"]>>>;
  readonly remoteTerm: (code: string) => Promise<ReturnType<typeof parse>>;
}
export const termLifecycleFixture = async (initial = false): Promise<TermLifecycleFixture> => {
  const f = await managedOperationalFixture();
  const course = {
    ...parse(fixtureCourseYaml),
    schema_version: 2,
    course: {
      ...parse(fixtureCourseYaml).course,
      lifecycle: "unarchived",
      term_creation_order: ["27s1", "27s2"]
    },
    faculty_directory: [42, 43, 44].map((id) => ({
      institutional_username: `faculty-${id}`,
      github_user_id: id,
      github_login: `faculty-${id}`,
      github_login_history: []
    })),
    fallback_administrator: { github_user_id: 42 }
  };
  const term = (code: string, status: string, coordinator: number) => ({
    schema_version: 2,
    term: {
      code,
      academic_year: 2027,
      semester: 1,
      display_name: code,
      status,
      has_ever_been_active: status !== "draft"
    },
    coordinators: { current: [{ github_user_id: coordinator }], former: [] },
    sections: [{ id: "001", faculty: { current: [{ github_user_id: 44 }], former: [] } }]
  });
  fs.writeFileSync(path.join(f.writer, "course.yml"), stringify(course));
  fs.writeFileSync(
    path.join(f.writer, "terms/27s1/term.yml"),
    stringify(term("27s1", initial ? "archived" : "active", 42))
  );
  fs.mkdirSync(path.join(f.writer, "terms/27s2"));
  fs.writeFileSync(
    path.join(f.writer, "terms/27s2/term.yml"),
    stringify(term("27s2", "draft", 43))
  );
  await git(f.writer, ["add", "."]);
  await git(f.writer, ["commit", "-m", "Isolated v2 fixture"]);
  await git(f.writer, ["push", "origin", "main"]);
  const head = await git(f.remote, ["rev-parse", "main"]);
  const synchronize = async () => {
    const workspace = (await f.auth.factory.open(f.cache)) as unknown as GitWorkspaceSynchronizer;
    await workspace.fetchOrigin({ authentication: f.auth.authentication });
    const currentCommit = await git(f.remote, ["rev-parse", "main"]);
    const state = await workspace.inspect();
    if (state.head.kind !== "attached") throw new Error("Detached fixture cache.");
    if (state.head.commit !== currentCommit)
      await workspace.fastForwardToCommit({
        expectedHead: state.head.commit,
        expectedBranch: "main",
        targetCommit: currentCommit
      });
    return { status: "up_to_date" as const, diagnostic: null, retryable: false, currentCommit };
  };
  await synchronize();
  const observed = {
    status: "reconciled" as const,
    studentFacingReady: true,
    organization: [],
    teams: [],
    coursePermissions: [],
    studentPermissions: []
  };
  const reconcile = vi.fn<NonNullable<TermActivationRequest["reconcile"]>>(async () => {
    expect(await git(f.remote, ["rev-parse", "main"])).not.toBe(head);
    return Object.freeze(observed);
  });
  const input: TermActivationRequest["input"] = {
    token: "oauth-fixture-secret",
    userId: 42,
    course: { ...f.course, schemaVersion: 2 },
    signal: new AbortController().signal,
    revalidateSession: async () => true,
    resynchronize: synchronize
  };
  const request: TermActivationRequest = {
    userData: f.root,
    input,
    context: {
      userId: 42,
      repositoryId: 20,
      authoritativeCommit: head,
      operationalCommit: head,
      courseFolderId: "fixture",
      courseFolderPath: f.cache,
      mode: "new_mutation"
    },
    expectedRevision: head,
    author: { name: "Fixture", email: "fixture@example.test" },
    changed: vi.fn(),
    authenticate: f.authenticate,
    revalidateRepository: vi.fn(async () => {}),
    targetTermCode: "27s2",
    reconcile,
    reconciliation: {
      client: {} as never,
      studentTargets: [],
      invitationJournal: new Set(),
      teamCreationJournal: new Set()
    }
  };
  const remoteTerm = async (code: string) =>
    parse(await git(f.remote, ["show", `main:terms/${code}/term.yml`]));
  const advance = async () => {
    const file = path.join(f.writer, "course.yml");
    fs.writeFileSync(
      file,
      fs.readFileSync(file, "utf8").replace("Original title", "Remote winner")
    );
    await git(f.writer, ["commit", "-am", "Remote winner"]);
    await git(f.writer, ["push", "origin", "main"]);
    return git(f.remote, ["rev-parse", "main"]);
  };
  return { ...f, head, request, reconcile, remoteTerm, advance, observed };
};
