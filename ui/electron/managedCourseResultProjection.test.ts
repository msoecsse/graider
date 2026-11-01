// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { projectManagedCourseResult } from "./managedCourseResultProjection";
import { createCourseMutationIpc } from "./courseMutationIpc";
import type { ManagedCourseMutationGuard } from "./managedCourseMutationGuard";
import { IPC_CHANNELS, type CourseFolderDashboardResult } from "./ipc";

const selector = "managed-course:42:20";
const roots = [
  "/Users/faculty/Graider/managed-courses/42/20/repo",
  String.raw`C:\Users\Faculty Name\Graider\managed-courses\42\20\repo`
];

describe("managed course result projection", () => {
  it.each(roots)("projects nested dashboard paths without JSON escaping dependence: %s", (root) => {
    const result: CourseFolderDashboardResult = {
      courseFolderId: selector,
      courseFolderPath: root,
      status: "failure",
      refreshedAt: null,
      dashboard: {
        schemaVersion: 1,
        commandName: "dashboard",
        status: "success",
        exitCode: 0,
        diagnostics: [{ context: { courseFolderPath: root } }],
        summary: { count: 1, optional: undefined },
        cards: [{ courseFolderPath: root, title: "Course", sections: [null, root] }]
      },
      error: {
        code: "failed",
        message: "Try again",
        exitCode: 1,
        cwd: root,
        argv: ["graider", "dashboard"],
        stdoutSnippet: null,
        stderrSnippet: null
      }
    };
    const before = structuredClone(result);
    const projected = projectManagedCourseResult(result, root, selector);
    expect(projected).toMatchObject({
      courseFolderPath: selector,
      dashboard: {
        diagnostics: [{ context: { courseFolderPath: selector } }],
        cards: [{ courseFolderPath: selector, title: "Course", sections: [null, selector] }]
      },
      error: { cwd: selector, message: "Try again" }
    });
    expect(JSON.stringify(projected)).not.toContain(JSON.stringify(root).slice(1, -1));
    expect(result).toEqual(before);
    expect(projected).not.toBe(result);
    expect(projected.dashboard).not.toBe(result.dashboard);
    expect(projected.dashboard?.summary).toHaveProperty("optional", undefined);
  });

  it.each(roots)("preserves prose and all nonmatching strings: %s", (root) => {
    const result = {
      message: `Source ${root} needs attention`,
      title: "Course title",
      relative: "terms/27s1/assignment.yml",
      selector,
      empty: "",
      flag: false,
      count: 2,
      absent: null
    };
    expect(projectManagedCourseResult(result, root, selector)).toEqual(result);
  });

  it.each(roots)(
    "keeps managed-only read paths behind IPC while preserving exact revisions: %s",
    async (root) => {
      const handlers = new Map<string, Function>();
      const sender = Object.assign(new EventEmitter(), {
        id: 1,
        isDestroyed: () => false,
        send: vi.fn()
      });
      const context = {
        managed: true,
        userId: 42,
        repositoryId: 20,
        authoritativeCommit: "a".repeat(40),
        courseFolderId: selector,
        courseFolderPath: root,
        legacyFolderPath: selector
      };
      const guard = { read: vi.fn(async (_id, _path, operation) => operation(context)) };
      const ipc = createCourseMutationIpc(
        {
          handle: (channel, handler) => {
            handlers.set(channel, handler);
          }
        },
        () => guard as unknown as ManagedCourseMutationGuard
      );
      ipc.handle(IPC_CHANNELS.getAssignmentDetail, async (_event, request) => {
        expect(request.courseFolderPath).toBe(root);
        return {
          courseFolderPath: root,
          nested: [{ courseFolderPath: root }],
          title: "Assignment"
        };
      });
      const result = await handlers.get(IPC_CHANNELS.getAssignmentDetail)!(
        { sender },
        { courseFolderId: selector, courseFolderPath: selector }
      );
      expect(result).toEqual({
        courseFolderPath: selector,
        nested: [{ courseFolderPath: selector }],
        title: "Assignment",
        courseReadRevision: context.authoritativeCommit
      });
      expect(JSON.stringify(result)).not.toContain(JSON.stringify(root).slice(1, -1));
    }
  );

  it("leaves registered legacy read results unchanged", async () => {
    const handlers = new Map<string, Function>();
    const sender = Object.assign(new EventEmitter(), {
      id: 1,
      isDestroyed: () => false,
      send: vi.fn()
    });
    const guard = { read: vi.fn(async (_id, _path, operation) => operation()) };
    const ipc = createCourseMutationIpc(
      {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        }
      },
      () => guard as unknown as ManagedCourseMutationGuard
    );
    const result = {
      courseFolderPath: "/faculty/course",
      title: "Legacy course",
      nested: ["unchanged"]
    };
    ipc.handle(IPC_CHANNELS.getAssignmentDetail, async () => result);
    expect(
      await handlers.get(IPC_CHANNELS.getAssignmentDetail)!(
        { sender },
        { courseFolderId: "registered", courseFolderPath: result.courseFolderPath }
      )
    ).toBe(result);
  });
});
