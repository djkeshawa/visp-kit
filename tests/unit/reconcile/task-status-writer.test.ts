import { describe, expect, it } from "vitest";

import { type ReviewReport } from "../../../src/artifacts/schemas/review.schema.js";
import { taskStatusBasis } from "../../../src/reconcile/task-status-writer.js";

const review = {
  result: "passed",
  changedFiles: [{ path: "src/notes.ts" }, { path: "tests/notes.test.ts" }],
  scopeBasis: {
    kind: "working-tree",
    description: "Uncommitted working tree (git diff source: unstaged).",
    diffSource: "unstaged",
    baseRef: null,
    filesExamined: 2,
    examinedFiles: ["src/notes.ts", "tests/notes.test.ts"],
    reviewableFiles: ["src/notes.ts", "tests/notes.test.ts"],
    empty: false
  },
  scopeReview: { reviewedExpectedFiles: ["tests/notes.test.ts"] }
} as unknown as ReviewReport;

describe("taskStatusBasis", () => {
  it("records what the transition was decided on", () => {
    const basis = taskStatusBasis({
      status: "verified",
      recordedAt: "2026-08-17T00:00:00.000Z",
      review,
      verificationPassed: true
    });

    expect(basis.status).toBe("verified");
    expect(basis.verificationPassed).toBe(true);
    expect(basis.review).toEqual({
      result: "passed",
      basis: "Uncommitted working tree (git diff source: unstaged).",
      filesExamined: 2,
      reviewableFiles: 2,
      reviewedExpectedFiles: ["tests/notes.test.ts"]
    });
  });

  it("says so plainly when there was no review behind the status", () => {
    const basis = taskStatusBasis({
      status: "done",
      recordedAt: "2026-08-17T00:00:00.000Z",
      verificationPassed: false
    });

    expect(basis.review).toBeNull();
    expect(basis.verificationPassed).toBe(false);
  });

  it("falls back to a stated absence for a review written before the basis existed", () => {
    const legacy = {
      result: "warnings",
      changedFiles: [{ path: "src/notes.ts" }],
      scopeReview: {}
    } as unknown as ReviewReport;

    const basis = taskStatusBasis({
      status: "done",
      recordedAt: "2026-08-17T00:00:00.000Z",
      review: legacy,
      verificationPassed: true
    });

    expect(basis.review?.basis).toBe("Basis not recorded by this review.");
    expect(basis.review?.filesExamined).toBe(1);
    expect(basis.review?.reviewedExpectedFiles).toEqual([]);
  });
});
