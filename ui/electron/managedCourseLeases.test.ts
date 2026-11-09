// @vitest-environment node
import { expect, it } from "vitest";
import { serializeManagedOperation, withManagedLocalOperation } from "./managedCourses";

const barrier = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
it("overlaps independent local work, excludes cache writers and prevents writer starvation", async () => {
  const request = {
    userId: 42,
    course: { repositoryId: 123 },
    signal: new AbortController().signal
  };
  const first = barrier(),
    second = barrier(),
    writer = barrier(),
    releaseReads = barrier(),
    releaseWriter = barrier();
  const events: string[] = [];
  const reads = [first, second].map((entered, index) =>
    withManagedLocalOperation(request, async () => {
      events.push(`read-${index}`);
      entered.release();
      await releaseReads.promise;
    })
  );
  await Promise.all([first.promise, second.promise]);
  const write = serializeManagedOperation(request, async () => {
    events.push("writer");
    writer.release();
    await releaseWriter.promise;
  });
  const later = withManagedLocalOperation(request, async () => {
    events.push("later");
  });
  await Promise.resolve();
  expect(events).toEqual(["read-0", "read-1"]);
  releaseReads.release();
  await writer.promise;
  expect(events).toEqual(["read-0", "read-1", "writer"]);
  releaseWriter.release();
  await Promise.all([...reads, write, later]);
  expect(events).toEqual(["read-0", "read-1", "writer", "later"]);
});
it("releases rejected/cancelled leases and keeps different courses independent", async () => {
  const controller = new AbortController();
  const request = { userId: 42, course: { repositoryId: 124 }, signal: controller.signal };
  const entered = barrier(),
    release = barrier();
  const held = withManagedLocalOperation(request, async () => {
    entered.release();
    await release.promise;
  });
  await entered.promise;
  controller.abort();
  const cancelled = expect(
    serializeManagedOperation(request, async () => "unsafe")
  ).rejects.toThrow();
  const other = await serializeManagedOperation(
    { ...request, course: { repositoryId: 125 }, signal: new AbortController().signal },
    async () => "independent"
  );
  expect(other).toBe("independent");
  release.release();
  await Promise.all([held, cancelled]);
  const active = { ...request, signal: new AbortController().signal };
  await expect(
    withManagedLocalOperation(active, async () => {
      throw new Error("fixture");
    })
  ).rejects.toThrow("fixture");
  await expect(serializeManagedOperation(active, async () => "recovered")).resolves.toBe(
    "recovered"
  );
});
