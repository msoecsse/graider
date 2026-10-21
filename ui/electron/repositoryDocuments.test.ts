import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverRepositoryDocuments,
  readRepositoryDocument,
  validateDocxArchive
} from "./repositoryDocuments.js";
import { DOCUMENT_LIMITS, DOCUMENT_TOO_LARGE } from "./repositoryDocumentPolicy.js";
import {
  isGradingStudentDocumentRequest,
  loadGradingStudentDocument
} from "./gradingStudentDocumentService.js";
import { recordLocalRepository, getLocalRepositoryLocatorPath } from "./localRepositoryLocator.js";
import { createGradingStudentSourceService } from "./gradingStudentSourceService.js";

const scope = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("./facultyScopeService.js", () => ({ resolveCurrentFacultyScope: scope.resolve }));
const fixtures = path.resolve("test-fixtures/repository-documents");
const roots: string[] = [];
const repository = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "graider-document-test-"));
  roots.push(root);
  await fs.cp(fixtures, root, { recursive: true });
  return root;
};
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
const identity = {
  courseFolderId: "course",
  courseFolderPath: "/course",
  termCode: "27s1",
  assignmentSlug: "lab",
  studentId: "ada"
};

describe("repository documents", () => {
  it("discovers root and nested documents case insensitively, ignoring source files, internals, dependencies, and symlinks", async () => {
    const root = await repository();
    await fs.mkdir(path.join(root, "nested"));
    await fs.copyFile(path.join(root, "normal.pdf"), path.join(root, "nested", "REPORT.PDF"));
    await fs.copyFile(path.join(root, "structured.docx"), path.join(root, "nested", "Notes.DOCX"));
    await fs.writeFile(path.join(root, "Main.java"), "class Main {}");
    for (const directory of [".git", "node_modules", ".graider"]) {
      await fs.mkdir(path.join(root, directory));
      await fs.writeFile(path.join(root, directory, "secret.pdf"), "excluded");
    }
    await fs.symlink(os.tmpdir(), path.join(root, "outside"));
    await fs.symlink(path.join(root, "normal.pdf"), path.join(root, "linked.pdf"));
    expect(await discoverRepositoryDocuments(root)).toEqual([
      "image-only.pdf",
      "malformed.docx",
      "malformed.pdf",
      "multipage.pdf",
      "nested/Notes.DOCX",
      "nested/REPORT.PDF",
      "normal.pdf",
      "oversized-image.pdf",
      "structured.docx"
    ]);
  });
  it("opens real PDF and DOCX bytes through the bounded repository reader, without caching", async () => {
    const root = await repository();
    expect(
      Buffer.from(await readRepositoryDocument(root, "normal.pdf"))
        .subarray(0, 5)
        .toString()
    ).toBe("%PDF-");
    expect((await readRepositoryDocument(root, "structured.docx")).length).toBeGreaterThan(0);
    await fs.copyFile(path.join(root, "normal.pdf"), path.join(root, "..notes.pdf"));
    expect((await readRepositoryDocument(root, "..notes.pdf")).length).toBeGreaterThan(0);
    const updated = await fs.readFile(path.join(root, "multipage.pdf"));
    await fs.writeFile(path.join(root, "normal.pdf"), updated);
    expect(Buffer.from(await readRepositoryDocument(root, "normal.pdf"))).toEqual(updated);
  });
  it.each([
    "../normal.pdf",
    "/normal.pdf",
    "C:/normal.pdf",
    "nested/../../normal.pdf",
    "nested/../normal.pdf",
    "nested\\normal.pdf",
    ".git/config.pdf",
    "node_modules/a.pdf",
    "normal.txt",
    "normal.pdf\0",
    "file://normal.pdf"
  ])("rejects renderer path %s", async (file) => {
    expect(isGradingStudentDocumentRequest({ ...identity, file })).toBe(false);
    await expect(readRepositoryDocument(await repository(), file)).rejects.toThrow();
  });
  it("rejects extra IPC keys and arbitrary absolute-file requests", () => {
    expect(isGradingStudentDocumentRequest({ ...identity, file: "normal.pdf" })).toBe(true);
    expect(
      isGradingStudentDocumentRequest({ ...identity, file: "normal.pdf", repositoryRoot: "/" })
    ).toBe(false);
    expect(isGradingStudentDocumentRequest({ ...identity, file: "normal.pdf", bytes: [] })).toBe(
      false
    );
  });
  it("rejects file and directory symlinks even when the final target is inside the repository", async () => {
    const root = await repository();
    await fs.symlink(path.join(root, "normal.pdf"), path.join(root, "link.pdf"));
    await fs.symlink(root, path.join(root, "link-directory"));
    await expect(readRepositoryDocument(root, "link.pdf")).rejects.toThrow();
    await expect(readRepositoryDocument(root, "link-directory/normal.pdf")).rejects.toThrow();
  });
  it("rejects oversized PDF before reading it into memory", async () => {
    const root = await repository();
    const handle = await fs.open(path.join(root, "huge.pdf"), "w");
    await handle.truncate(DOCUMENT_LIMITS.fileBytes + 1);
    await handle.close();
    await expect(readRepositoryDocument(root, "huge.pdf")).rejects.toThrow(DOCUMENT_TOO_LARGE);
  });
  it("validates actual DOCX archive inflation and rejects malformed and oversized archives", async () => {
    await expect(
      validateDocxArchive(await fs.readFile(path.join(fixtures, "structured.docx")))
    ).resolves.toBeUndefined();
    await expect(
      validateDocxArchive(await fs.readFile(path.join(fixtures, "malformed.docx")))
    ).rejects.toThrow();
    const bytes = await fs.readFile(path.join(fixtures, "structured.docx"));
    const centralHeader = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const UNCOMPRESSED_SIZE_OFFSET = 24;
    bytes.writeUInt32LE(
      DOCUMENT_LIMITS.docxExpandedBytes + 1,
      centralHeader + UNCOMPRESSED_SIZE_OFFSET
    );
    await expect(validateDocxArchive(bytes)).rejects.toThrow(DOCUMENT_TOO_LARGE);
  });
  it("loads only the authorized student's recorded repository and safely reports corrupt DOCX", async () => {
    const root = await repository();
    recordLocalRepository(getLocalRepositoryLocatorPath(root), { ...identity, localPath: root });
    scope.resolve.mockReturnValue({ status: "success", students: [{ studentId: "ada" }] });
    const request = { ...identity, userDataPath: root };
    const result = await loadGradingStudentDocument({ ...request, file: "normal.pdf" });
    expect(result.status).toBe("success");
    if (result.status === "success")
      expect(Buffer.from(result.bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await loadGradingStudentDocument({ ...request, file: "malformed.docx" })).toMatchObject({
      status: "failure",
      message: expect.stringContaining("damaged")
    });
    expect(await loadGradingStudentDocument({ ...request, file: "/etc/passwd" })).toMatchObject({
      status: "failure"
    });
  });
  it("does not access the repository for students outside faculty scope", async () => {
    scope.resolve.mockReturnValue({ status: "success", students: [] });
    expect(
      await loadGradingStudentDocument({
        ...identity,
        file: "normal.pdf",
        userDataPath: "/missing"
      })
    ).toEqual({ status: "failure", message: "This student's documents are unavailable." });
  });
  it("projects documents beside unchanged source sections and tags refreshed results with the current SHA", async () => {
    const root = await repository();
    const source = {
      status: "success",
      studentId: "ada",
      combinedText: "class Main {}",
      sections: [{ file: "Main.java" }],
      syntheticCombinedLines: []
    };
    const backend = { loadGradingStudentSourceContext: vi.fn().mockReturnValue(source) };
    const head = vi.fn().mockResolvedValue({ status: "success", submissionCommitSha: "old-sha" });
    const load = createGradingStudentSourceService({
      resolveFacultyScope: vi
        .fn()
        .mockReturnValue({ status: "success", students: [{ studentId: "ada" }] }),
      resolveRepository: () => ({ status: "success", localPath: root }),
      readHead: head,
      loadBackend: () => backend
    });
    const request = { ...identity, userDataPath: "/user" };
    expect(await load(request)).toMatchObject({
      ...source,
      documents: expect.arrayContaining(["normal.pdf", "structured.docx"]),
      documentRevision: "old-sha"
    });
    head.mockResolvedValue({ status: "success", submissionCommitSha: "new-sha" });
    await fs.writeFile(path.join(root, "new.pdf"), "new document");
    expect(await load(request)).toMatchObject({
      documentRevision: "new-sha",
      documents: expect.arrayContaining(["new.pdf"])
    });
    expect(backend.loadGradingStudentSourceContext).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currentSubmissionCommitSha: "new-sha",
        excludedSourceExtensions: ["pdf", "docx"]
      })
    );
  });
});
