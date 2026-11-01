/* global process, console, AbortController, setTimeout */
// Run from ui after npm run build. This uses only disposable profiles and local Git remotes.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { exec } = require(process.cwd() + "/node_modules/dugite");
const base = path.join(process.cwd(), "dist-electron");
const { ManagedCourseMutationGuard } = require(base + "/managedCourseMutationGuard.js");
const { createCourseMutationIpc } = require(base + "/courseMutationIpc.js");
const { managedCourseOperation } = require(base + "/managedCourseOperationContext.js");
const {
  performSynchronization,
  serializeManagedOperation,
  managedCoursePath,
  loadManagedCatalog
} = require(base + "/managedCourses.js");
const { createAuthenticatedProductionGitWorkspace } = require(base + "/gitWorkspaceReader.js");
const { loadAssignmentSetupTerms } = require(base + "/assignmentSetupService.js");
const { saveStudentAccessPagesConfig } = require(base + "/studentAccessPagesConfigService.js");
const { IPC_CHANNELS } = require(base + "/ipc.js");
const { GITHUB_OAUTH_CHANNELS } = require(base + "/githubOAuthTypes.js");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-s29-electron-"));
app.setPath("userData", path.join(root, "profile"));
const git = async (cwd, args) => {
  const r = await exec(args, cwd);
  assert.equal(r.exitCode, 0, `fixture Git ${args[0]}: ${r.stderr}`);
  return r.stdout.trim();
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 120));
app
  .whenReady()
  .then(async () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "electron/managedOperationalFixtures.ts"),
      "utf8"
    );
    const courseYaml = source.match(/fixtureCourseYaml = `([\s\S]*?)`;/)[1],
      termYaml = source.match(/fixtureTermYaml = `([\s\S]*?)`;/)[1];
    const remote = path.join(root, "remote.git"),
      writer = path.join(root, "writer"),
      legacy = path.join(root, "legacy"),
      cache = managedCoursePath(root, 42, 20),
      url = "https://github.com/fixture/course.git";
    await git(root, ["init", "--bare", "--initial-branch=main", remote]);
    await git(root, ["clone", "--no-hardlinks", remote, writer]);
    await git(writer, ["config", "user.name", "Fixture"]);
    await git(writer, ["config", "user.email", "fixture@example.test"]);
    fs.mkdirSync(path.join(writer, "terms/27s1"), { recursive: true });
    fs.writeFileSync(path.join(writer, "course.yml"), courseYaml);
    fs.writeFileSync(path.join(writer, "terms/27s1/term.yml"), termYaml);
    await git(writer, ["add", "."]);
    await git(writer, ["commit", "-m", "Initial"]);
    await git(writer, ["push", "origin", "main"]);
    const prepare = async (destination) => {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      await git(root, ["clone", "--no-hardlinks", remote, destination]);
      await git(destination, ["remote", "set-url", "origin", url]);
      await git(destination, ["config", `url.${remote}.insteadOf`, url]);
    };
    await prepare(legacy);
    await prepare(cache);
    const originalHead = await git(cache, ["rev-parse", "HEAD"]);
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
      code: "fixture101",
      title: "Fixture",
      schemaVersion: 1,
      discoveryHints: [],
      authorization: "authorized",
      localStatus: "registered_local",
      localFolderIds: ["registered"],
      diagnostics: [],
      bootstrap: { status: "ready", diagnostic: null, retryable: false }
    };
    const reader = {
      resolveId: async () => repository,
      resolve: async () => repository,
      terms: async () => ["27s1"],
      file: async (_r, file) => {
        const r = await exec(["show", `main:${file}`], remote);
        return r.exitCode === 0 ? r.stdout : null;
      }
    };
    require(base + "/githubRemoteRepositories.js").createRemoteRepositoryReader = () => reader;
    const auth = createAuthenticatedProductionGitWorkspace("s29-main-only-oauth-fixture-secret");
    let beforePush,
      failActivation = false,
      writes = 0,
      pushes = 0,
      manualPublications = 0,
      externalWrites = 0;
    const authenticate = () => ({
      authentication: auth.authentication,
      factory: {
        inspect: auth.factory.inspect.bind(auth.factory),
        clone: async ({ remote: locator, destination, authentication }) => {
          assert.equal(locator, url);
          assert.equal(authentication, auth.authentication);
          await prepare(destination);
          return auth.factory.open(destination);
        },
        open: async (directory) => {
          const workspace = await auth.factory.open(directory);
          return new Proxy(workspace, {
            get(target, property) {
              if (property === "pushBranch")
                return async (request) => {
                  pushes++;
                  assert.equal(request.authentication, auth.authentication);
                  assert.equal(request.remote, "origin");
                  assert.equal(request.branch, "main");
                  await beforePush?.();
                  return target.pushBranch(request);
                };
              return typeof target[property] === "function"
                ? target[property].bind(target)
                : target[property];
            }
          });
        }
      }
    });
    const state = () => ({
      status: "signed_in",
      identity: { id: 42, login: "fixture", name: "Fixture" },
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
    const session = {
      getState: state,
      mutationGeneration: 1,
      withSynchronizedCourse: async (_id, _user, operation) => {
        const input = {
          token: "s29-main-only-oauth-fixture-secret",
          userId: 42,
          course,
          signal: new AbortController().signal,
          revalidateSession: async () => true
        };
        const synchronize = async (afterPublication = false) => {
          if (afterPublication && failActivation) {
            failActivation = false;
            throw new Error("Injected local activation failure");
          }
          const sync = await performSynchronization({
            ...input,
            userData: root,
            username: "jones",
            reader,
            authenticate: () => auth,
            requireFacultyAuthorization: !afterPublication,
            onProgress: () => {}
          });
          course = { ...course, synchronization: sync };
          return sync;
        };
        return serializeManagedOperation(input, async () =>
          operation({ ...input, resynchronize: synchronize }, await synchronize())
        );
      }
    };
    const guard = new ManagedCourseMutationGuard({
      userData: root,
      session,
      username: () => "jones",
      folders: () => [{ id: "registered", path: legacy }],
      authenticate
    });
    const guarded = createCourseMutationIpc(
      ipcMain,
      () => guard,
      undefined,
      () => BrowserWindow.getAllWindows().map((win) => win.webContents)
    );
    guarded.handle(IPC_CHANNELS.loadAssignmentSetupTerms, (_e, request) => {
      assert.equal(request.courseFolderPath, cache);
      return loadAssignmentSetupTerms(request.courseFolderPath);
    });
    guarded.handle(IPC_CHANNELS.saveStudentAccessPagesConfig, (_e, request) => {
      writes++;
      const context = managedCourseOperation.getStore();
      assert.equal(context.transaction, true);
      assert.notEqual(request.courseFolderPath, cache);
      assert.notEqual(request.courseFolderPath, legacy);
      return saveStudentAccessPagesConfig(request);
    });
    guarded.handle(IPC_CHANNELS.gradeAssignment, (_e, request) => {
      externalWrites++;
      assert.equal(request.courseFolderPath, cache);
      const backend = require(base + "/gradingStudentViewStateBackend.cjs");
      assert.equal(
        backend.saveGradingStudentViewStateContext({
          courseFolderPath: cache,
          termCode: "27s1",
          assignmentSlug: "lab01",
          studentId: "s1",
          currentSubmissionCommitSha: "a".repeat(40),
          viewState: { scrollTop: 12, cursor: { file: "src/Main.java", line: 1, column: 1 } }
        }).status,
        "success"
      );
      return { status: "success" };
    });
    guarded.handle(IPC_CHANNELS.publishCourseChanges, () => {
      manualPublications++;
      throw new Error("Legacy publisher must not run");
    });
    ipcMain.handle(IPC_CHANNELS.checkGitHubAuth, () => ({
      status: "success",
      source: "fixture",
      message: "Isolated smoke",
      error: null
    }));
    ipcMain.handle(IPC_CHANNELS.listCourseFolders, () => []);
    ipcMain.handle(IPC_CHANNELS.getAppInfo, () => ({
      name: "Graider isolated managed smoke",
      version: "fixture"
    }));
    ipcMain.handle(IPC_CHANNELS.getLocalSettings, () => ({ currentFacultyMsoeUsername: "jones" }));
    ipcMain.handle(GITHUB_OAUTH_CHANNELS.get, state);
    const createWindow = async () => {
      const win = new BrowserWindow({
        show: false,
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
      return win;
    };
    const win = await createWindow(),
      sibling = await createWindow();
    const invoke = async (method, request, target = win) =>
      target.webContents.executeJavaScript(
        `window.graiderUI[${JSON.stringify(method)}](${JSON.stringify(request)}).then(value=>({value}),error=>({error:error.message}))`
      );
    const reload = async (target = win) => {
      const loaded = new Promise((resolve) => target.webContents.once("did-finish-load", resolve));
      await invoke("reloadCourseView", undefined, target);
      await loaded;
      await tick();
    };
    const identity = { courseFolderId: "registered", courseFolderPath: legacy };
    assert.equal((await invoke("getCourseOperationalMode", "registered")).value, "legacy");
    assert.ok(!(await invoke("cutoverManagedCourse", "registered")).error);
    await reload();
    await reload(sibling);
    assert.equal((await invoke("getCourseOperationalMode", "registered")).value, "managed");
    const read = (await invoke("loadAssignmentSetupTerms", identity)).value;
    assert.equal(read.courseReadRevision, originalHead);
    await invoke("loadAssignmentSetupTerms", identity, sibling);
    const config = {
      ...identity,
      expectedCourseRevision: read.courseReadRevision,
      repository: "fixture/pages",
      baseUrl: "https://example.test/pages",
      branch: "main"
    };
    let result = (await invoke("saveStudentAccessPagesConfig", config)).value;
    assert.equal(result.publication.status, "success");
    assert.equal(result.publication.refreshRequired, false);
    assert.equal(writes, 1);
    assert.equal(pushes, 1);
    assert.equal(await git(cache, ["status", "--porcelain"]), "");
    assert.equal(await git(legacy, ["rev-parse", "HEAD"]), originalHead);
    await tick();
    assert.ok(
      await sibling.webContents.executeJavaScript(
        "document.body.textContent.includes('Refresh/reopen this view')"
      )
    );
    assert.equal((await invoke("gradeAssignment", identity)).value.status, "success");
    assert.equal(externalWrites, 1);
    assert.equal((await invoke("publishCourseChanges", "registered")).value.status, "up_to_date");
    assert.equal(manualPublications, 0);
    const advance = async (title) => {
      await git(writer, ["fetch", "origin"]);
      await git(writer, ["merge", "--ff-only", "origin/main"]);
      fs.writeFileSync(
        path.join(writer, "course.yml"),
        fs
          .readFileSync(path.join(writer, "course.yml"), "utf8")
          .replace(/title: .*/u, `title: ${title}`)
      );
      await git(writer, ["commit", "-am", title]);
      await git(writer, ["push", "origin", "main"]);
      return git(writer, ["rev-parse", "HEAD"]);
    };
    await advance("Remote update");
    await win.webContents.executeJavaScript(
      "const draft=document.createElement('input'); draft.id='faculty-draft'; draft.value='Preserved faculty form'; document.body.append(draft)"
    );
    assert.ok((await invoke("saveStudentAccessPagesConfig", config)).error);
    assert.equal(writes, 1);
    await tick();
    assert.equal(
      await win.webContents.executeJavaScript("document.getElementById('faculty-draft').value"),
      "Preserved faculty form"
    );
    assert.ok(
      await win.webContents.executeJavaScript(
        "document.body.textContent.includes('course changed remotely')"
      )
    );
    fs.writeFileSync(
      path.join(root, "stale-editor.png"),
      (await win.webContents.capturePage()).toPNG()
    );
    await reload();
    const current = (await invoke("loadAssignmentSetupTerms", identity)).value.courseReadRevision;
    let winner;
    beforePush = async () => {
      winner = await advance("Race winner");
    };
    assert.ok(
      (
        await invoke("saveStudentAccessPagesConfig", {
          ...config,
          baseUrl: "https://example.test/race",
          expectedCourseRevision: current
        })
      ).error
    );
    beforePush = undefined;
    assert.equal(await git(cache, ["rev-parse", "HEAD"]), winner);
    assert.equal(await git(cache, ["status", "--porcelain"]), "");
    await reload();
    const fresh = (await invoke("loadAssignmentSetupTerms", identity)).value.courseReadRevision;
    beforePush = async () => {
      failActivation = true;
    };
    result = (
      await invoke("saveStudentAccessPagesConfig", {
        ...config,
        baseUrl: "https://example.test/recovered",
        expectedCourseRevision: fresh
      })
    ).value;
    beforePush = undefined;
    assert.equal(result.publication.status, "success");
    assert.equal(result.publication.refreshRequired, true);
    assert.equal(
      loadManagedCatalog(root, 42).courses["20"].lastPublication.status,
      "refresh_required"
    );
    await tick();
    assert.ok(
      await win.webContents.executeJavaScript(
        "document.body.textContent.includes('Published remotely. Local course refresh needs attention')"
      )
    );
    fs.writeFileSync(
      path.join(root, "published-refresh.png"),
      (await win.webContents.capturePage()).toPNG()
    );
    const pushesBeforeRecovery = pushes;
    await invoke("loadAssignmentSetupTerms", identity);
    assert.equal(pushes, pushesBeforeRecovery);
    assert.equal(await git(cache, ["rev-parse", "HEAD"]), await git(remote, ["rev-parse", "main"]));
    assert.equal(await git(legacy, ["rev-parse", "HEAD"]), originalHead);
    await invoke("updateCourseSource", "registered");
    assert.equal(await git(legacy, ["rev-parse", "HEAD"]), await git(cache, ["rev-parse", "HEAD"]));
    const tokenProjection = await win.webContents.executeJavaScript(
      "window.graiderUI.githubOAuth.get().then(JSON.stringify)"
    );
    assert.ok(!tokenProjection.includes("s29-main-only-oauth-fixture-secret"));
    const evidence = {
      status: "passed",
      scenarios: 14,
      courseDomainWrites: writes,
      coursePushAttempts: pushes,
      legacyPublicationCalls: manualPublications,
      externalOperations: externalWrites,
      legacyChangedOnlyByExplicitUpdate: true,
      cacheClean: (await git(cache, ["status", "--porcelain"])) === "",
      screenshotPaths: [
        path.join(root, "stale-editor.png"),
        path.join(root, "published-refresh.png")
      ]
    };
    fs.writeFileSync(path.join(root, "result.json"), JSON.stringify(evidence, null, 2));
    console.log(
      "MANAGED_TRANSACTION_SMOKE_OK",
      JSON.stringify({ ...evidence, evidenceRoot: root })
    );
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
