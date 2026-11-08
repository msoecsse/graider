import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createMigrationReviewProgressStore } from "./migrationReviewProgress.js";
import {
  migrationViewFixture,
  reviewedSubmissionFixture,
  REVIEW_USER,
  REVIEW_REPO
} from "./migrationReviewFixtures.js";

const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
);
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-review-progress-"));
  roots.push(root);
  const view = migrationViewFixture();
  const record = {
    version: 1 as const,
    organizationId: view.analysis.source.organizationId!,
    reviewIdentity: view.sessionId,
    submission: reviewedSubmissionFixture(view),
    identities: view.verifiedFaculty.map((entry) => entry.identity),
    choices: [],
    grader: null
  };
  return { root, record, store: createMigrationReviewProgressStore(root) };
};
it("persists only review progress outside the course and survives a new store", () => {
  const f = fixture();
  expect(f.store.read(REVIEW_USER, REVIEW_REPO)).toBeNull();
  expect(fs.readdirSync(f.root)).toEqual([]);
  f.store.write(f.record);
  expect(createMigrationReviewProgressStore(f.root).read(REVIEW_USER, REVIEW_REPO)).toEqual(
    f.record
  );
  expect(f.store.read(REVIEW_USER + 1, REVIEW_REPO)).toBeNull();
  expect(f.store.read(REVIEW_USER, REVIEW_REPO + 1)).toBeNull();
});
it("rejects unknown authority and credentials and safely ignores corrupt/incomplete records", () => {
  const f = fixture();
  expect(() => f.store.write({ ...f.record, publicationReady: true })).toThrow();
  expect(() => f.store.write({ ...f.record, token: "fictional-secret" })).toThrow();
  f.store.write(f.record);
  const file = path.join(
    f.root,
    "managed-courses",
    String(REVIEW_USER),
    String(REVIEW_REPO),
    "migration-review.json"
  );
  fs.writeFileSync(file, "{");
  expect(f.store.read(REVIEW_USER, REVIEW_REPO)).toBeNull();
  fs.writeFileSync(file, JSON.stringify({ version: 1 }));
  expect(f.store.read(REVIEW_USER, REVIEW_REPO)).toBeNull();
});
