/* global process, console, setTimeout, AbortController */
// Run from ui after npm run build. All identities and transports are isolated fixtures.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { exec } = require(process.cwd() + "/node_modules/dugite");
const base = path.join(process.cwd(), "dist-electron");
const { ManagedCourseMutationGuard } = require(base + "/managedCourseMutationGuard.js");
const { createCourseMutationIpc } = require(base + "/courseMutationIpc.js");
const { synchronizeManagedCourse, managedCoursePath } = require(base + "/managedCourses.js");
const { ManagedReconciliationService } = require(base + "/managedReconciliation.js");
const { createAuthenticatedProductionGitWorkspace } = require(base + "/gitWorkspaceReader.js");
const { publishCourseChanges } = require(base + "/coursePublishService.js");
const { IPC_CHANNELS } = require(base + "/ipc.js");
const { GITHUB_OAUTH_CHANNELS } = require(base + "/githubOAuthTypes.js");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-s28-electron-"));
const screenshotPath = path.join(root, "stale-source.png");
const resultPath = path.join(root, "smoke-result.json");
app.setPath("userData", path.join(root, "profile"));
const git = async (cwd, args) => {
  const r = await exec(args, cwd);
  assert.equal(r.exitCode, 0, `fixture git ${args[0]}`);
  return r.stdout.trim();
};
const tick = () => new Promise((r) => setTimeout(r, 120));
app
  .whenReady()
  .then(async () => {
    const fixture = fs.readFileSync(
      path.join(process.cwd(), "electron/managedSynchronization.integration.test.ts"),
      "utf8"
    );
    const courseYaml = fixture.match(/const courseYaml = `([\s\S]*?)`;/)[1];
    const termYaml = fixture.match(/const termYaml = `([\s\S]*?)`;/)[1];
    const remote = path.join(root, "remote.git"),
      writer = path.join(root, "writer"),
      legacy = path.join(root, "legacy");
    await git(root, ["init", "--bare", "--initial-branch=main", remote]);
    await git(root, ["clone", remote, writer]);
    await git(writer, ["config", "user.name", "Fixture"]);
    await git(writer, ["config", "user.email", "fixture@example.test"]);
    fs.mkdirSync(path.join(writer, "terms", "27s1"), { recursive: true });
    fs.writeFileSync(path.join(writer, "course.yml"), courseYaml);
    fs.writeFileSync(path.join(writer, "terms", "27s1", "term.yml"), termYaml);
    await git(writer, ["add", "."]);
    await git(writer, ["commit", "-m", "Initial"]);
    await git(writer, ["push", "origin", "main"]);
    const cache = managedCoursePath(root, 42, 20),
      url = "https://github.com/fixture/course.git";
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    for (const target of [cache, legacy]) {
      await git(root, ["clone", "--no-hardlinks", remote, target]);
      await git(target, ["remote", "set-url", "origin", url]);
      await git(target, ["config", `url.${remote}.insteadOf`, url]);
      await git(target, ["config", "user.name", "Fixture"]);
      await git(target, ["config", "user.email", "fixture@example.test"]);
    }
    const repository = {
      id: 20,
      nodeId: null,
      organizationId: 10,
      owner: "fixture",
      name: "course",
      fullName: "fixture/course",
      url: "https://github.com/fixture/course",
      defaultBranch: "main",
      visibility: "private",
      archived: false,
      disabled: false,
      topics: []
    };
    let course = {
      repositoryId: 20,
      nodeId: null,
      organizationId: 10,
      organizationLogin: "fixture",
      name: "course",
      fullName: repository.fullName,
      url: repository.url,
      defaultBranch: "main",
      visibility: "private",
      archived: false,
      code: "csc1120",
      title: "Fixture",
      schemaVersion: 1,
      discoveryHints: [],
      authorization: "authorized",
      localStatus: "registered_local",
      localFolderIds: ["legacy"],
      diagnostics: []
    };
    let generation = 1,
      signedIn = true,
      checks = 0,
      mutations = 0,
      studentWrites = 0;
    const context = createAuthenticatedProductionGitWorkspace("isolated-fixture-secret");
    const reader = {
      resolveId: async () => repository,
      resolve: async () => repository,
      terms: async () => ["27s1"],
      file: async (_r, file) => {
        const r = await exec(["show", `main:${file}`], remote);
        return r.exitCode === 0 ? r.stdout : null;
      }
    };
    const sessionState = () => ({
      status: signedIn ? "signed_in" : "signed_out",
      identity: signedIn ? { id: 42, login: "fixture", name: "Fixture" } : null,
      busy: false,
      persistence: "memory",
      message: null,
      repositoryPermission: "available",
      organizationPermission: "available",
      organizationDiscovery: { status: "ready", organizations: [], message: null, stale: false },
      courseDiscovery: {
        status: "ready",
        userId: 42,
        discoveredAt: null,
        courses: [course],
        diagnostics: []
      }
    });
    const request = () => ({
      onReconciliationProgress: (reconciliation) => {
        course = { ...course, reconciliation };
      },
      userData: root,
      userId: 42,
      course,
      username: "jones",
      signal: new AbortController().signal,
      revalidateSession: async () => signedIn,
      reader,
      authenticate: () => ({
        ...context,
        factory: {
          ...context.factory,
          open: context.factory.open.bind(context.factory),
          clone: async ({ destination }) => {
            await git(root, ["clone", "--no-hardlinks", remote, destination]);
            await git(destination, ["remote", "set-url", "origin", url]);
            await git(destination, ["config", `url.${remote}.insteadOf`, url]);
          }
        }
      }),
      onProgress: (synchronization) => {
        course = { ...course, synchronization };
      }
    });
    const session = {
      getState: sessionState,
      get mutationGeneration() {
        return generation;
      },
      withSynchronizedCourse: async (_id, _user, operation) => {
        checks++;
        const synchronization = await synchronizeManagedCourse(request());
        course = { ...course, synchronization };
        return operation(
          {
            token: "isolated",
            userId: 42,
            course,
            signal: new AbortController().signal,
            revalidateSession: async () => signedIn
          },
          synchronization
        );
      }
    };
    // The source-origin network resolver is replaced with an isolated fixture reader only.
    require(base + "/githubRemoteRepositories.js").createRemoteRepositoryReader = () => reader;
    const guard = new ManagedCourseMutationGuard({
      userData: root,
      session,
      username: () => "jones",
      folders: () => [{ id: "legacy", path: legacy }],
      authenticate: () => context
    });
    const guarded = createCourseMutationIpc(ipcMain, () => guard);
    guarded.handle(IPC_CHANNELS.saveRoster, () => {
      mutations++;
      return { status: "success" };
    });
    for (const channel of [
      IPC_CHANNELS.gradeAssignment,
      IPC_CHANNELS.repairGradingStudentWorkflow,
      IPC_CHANNELS.publishGradingStudentReport
    ])
      guarded.handle(channel, () => {
        studentWrites++;
        return { status: "success" };
      });
    guarded.handle(IPC_CHANNELS.publishCourseChanges, () =>
      publishCourseChanges(legacy, {
        runner: () => {
          throw Error("unexpected CLI");
        },
        resolveToken: async () => ({ status: "success", token: "isolated" }),
        createAuthenticatedWorkspace: () => context
      })
    );
    ipcMain.handle(IPC_CHANNELS.listCourseFolders, () => []);
    ipcMain.handle(IPC_CHANNELS.getAppInfo, () => ({
      name: "Graider isolated smoke",
      version: "fixture"
    }));
    ipcMain.handle(IPC_CHANNELS.getLocalSettings, () => ({ currentFacultyMsoeUsername: "jones" }));
    ipcMain.handle(GITHUB_OAUTH_CHANNELS.get, sessionState);
    const reconciliation = new ManagedReconciliationService();
    ipcMain.handle("graider-ui:managed-course:plan-reconciliation", () =>
      reconciliation.plan({ ...request(), sessionGeneration: generation })
    );
    ipcMain.handle("graider-ui:managed-course:cancel-reconciliation", (_e, id, plan) =>
      reconciliation.discard(plan, 42)
    );
    const win = new BrowserWindow({
      show: true,
      width: 1100,
      height: 800,
      webPreferences: {
        preload: path.join(base, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    await win.loadFile(path.join(process.cwd(), "dist/index.html"));
    await tick();
    const invoke = async (method, request) =>
      win.webContents.executeJavaScript(
        `window.graiderUI[${JSON.stringify(method)}](${JSON.stringify(request)}).then(value=>({value}),error=>({error:error.message}))`
      );
    const input = { courseFolderId: "legacy", courseFolderPath: legacy };
    assert.equal((await invoke("saveRoster", input)).value.status, "success");
    assert.equal(mutations, 1);
    const legacyBefore = await git(legacy, ["rev-parse", "HEAD"]);
    fs.writeFileSync(
      path.join(writer, "course.yml"),
      courseYaml.replace("Original title", "Remote title")
    );
    await git(writer, ["commit", "-am", "Remote advance"]);
    await git(writer, ["push", "origin", "main"]);
    assert.ok((await invoke("saveRoster", input)).error);
    assert.equal(mutations, 1);
    assert.equal(await git(legacy, ["rev-parse", "HEAD"]), legacyBefore);
    assert.equal(await git(legacy, ["status", "--porcelain"]), "");
    await tick();
    assert.ok(
      await win.webContents.executeJavaScript(
        `document.body.textContent.includes('Course source is out of date')`
      )
    );
    fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG());
    for (const method of [
      "gradeAssignment",
      "repairGradingStudentWorkflow",
      "publishGradingStudentReport"
    ])
      assert.ok((await invoke(method, input)).error);
    assert.equal(studentWrites, 0);
    fs.writeFileSync(path.join(cache, "notes.txt"), "recovery evidence");
    assert.ok((await invoke("saveRoster", input)).error);
    await tick();
    assert.ok(
      await win.webContents.executeJavaScript(
        `Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Review cache')`
      )
    );
    await win.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Review cache').click()`
    );
    await tick();
    assert.ok(
      await win.webContents.executeJavaScript(`document.body.textContent.includes('notes.txt')`)
    );
    await win.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Cancel').click()`
    );
    assert.equal(mutations, 1);
    const plan = await reconciliation.plan({ ...request(), sessionGeneration: generation });
    assert.equal(plan.eligible, true);
    const restored = await reconciliation.apply(
      { ...request(), sessionGeneration: generation },
      plan.planId,
      true
    );
    assert.equal(restored.status, "completed");
    assert.equal(mutations, 1);
    // Production operation: registry ID only, existing per-course boundary and bundled Git.
    assert.ok((await invoke("saveRoster", input)).error);
    await tick();
    await win.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Update course source').click()`
    );
    for (let attempt = 0; attempt < 80; attempt++) {
      if (
        await win.webContents.executeJavaScript(
          `document.body.textContent.includes('Course source updated. Refresh/reopen')`
        )
      )
        break;
      await tick();
    }
    assert.ok(
      await win.webContents.executeJavaScript(
        `document.body.textContent.includes('Course source updated. Refresh/reopen')`
      )
    );
    assert.equal(mutations, 1);
    assert.equal(await git(legacy, ["rev-parse", "HEAD"]), await git(cache, ["rev-parse", "HEAD"]));
    assert.ok(
      (await invoke("saveRoster", { ...input, rows: [{ studentId: "stale-renderer" }] })).error
    );
    assert.equal(mutations, 1);
    fs.writeFileSync(
      path.join(root, "updated-refresh-required.png"),
      (await win.webContents.capturePage()).toPNG()
    );
    const reloaded = new Promise((resolve) => win.webContents.once("did-finish-load", resolve));
    await win.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Refresh view').click()`
    );
    await reloaded;
    await tick();
    const beforeRetry = checks;
    assert.equal((await invoke("saveRoster", input)).value.status, "success");
    assert.ok(checks > beforeRetry);
    fs.writeFileSync(
      path.join(legacy, "course.yml"),
      courseYaml.replace("Original title", "Unpublished fixture title")
    );
    assert.ok((await invoke("saveRoster", input)).error);
    assert.equal(mutations, 2);
    const pendingHead = await git(legacy, ["rev-parse", "HEAD"]);
    const pendingContent = fs.readFileSync(path.join(legacy, "course.yml"), "utf8");
    assert.ok((await invoke("updateCourseSource", "legacy")).error);
    assert.equal(await git(legacy, ["rev-parse", "HEAD"]), pendingHead);
    assert.equal(fs.readFileSync(path.join(legacy, "course.yml"), "utf8"), pendingContent);
    const publication = await invoke("publishCourseChanges", "legacy");
    assert.equal(publication.value.status, "success");
    assert.equal((await invoke("saveRoster", input)).value.status, "success");
    assert.equal(mutations, 3);
    signedIn = false;
    generation++;
    assert.ok((await invoke("saveRoster", input)).error);
    assert.equal(mutations, 3);
    const report = {
      result: "PASS",
      profile: root,
      checks,
      mutations,
      studentWrites,
      blockedTargetWrites: 0,
      blockedCommits: 0,
      blockedPushes: 0,
      scenarios: [
        "healthy",
        "remote advance",
        "stale legacy UI diagnostic",
        "dispatch/repair/report blocked",
        "dirty managed cache",
        "existing Review cache panel",
        "cancel no mutation",
        "explicit reconciliation no mutation",
        "authenticated exact legacy fast-forward",
        "no mutation replay",
        "stale renderer save blocked",
        "required full document reload",
        "fresh guard on retry",
        "unpublished changes refused by source update",
        "pending publication",
        "publication retry",
        "post-publication mutation",
        "sign-out"
      ],
      screenshot: screenshotPath
    };
    fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    win.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
