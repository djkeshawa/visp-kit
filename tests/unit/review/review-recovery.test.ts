import { describe, expect, it } from "vitest";

import { type ReviewScopeBasis } from "../../../src/artifacts/schemas/review.schema.js";
import { reviewFailureRecovery, reviewNextCommand } from "../../../src/review/review-recovery.js";

function basis(overrides: Partial<ReviewScopeBasis> = {}): ReviewScopeBasis {
  return {
    kind: "working-tree",
    description: "Uncommitted working tree (git diff source: unstaged).",
    diffSource: "unstaged",
    baseRef: null,
    filesExamined: 3,
    examinedFiles: [".visp/status.json"],
    reviewableFiles: [],
    empty: true,
    ...overrides
  };
}

describe("reviewNextCommand", () => {
  it("moves on to reconcile when the review did not fail", () => {
    expect(reviewNextCommand({ result: "warnings", taskId: "T009", scopeBasis: basis() })).toBe(
      "visp-kit reconcile --task T009"
    );
  });

  it("points an empty working-tree review at a base range instead of at itself", () => {
    // LC-131: the loop was review fails -> `visp-kit verify` -> verify passes ->
    // review fails, and `done` printed `visp-kit review --task T009`, which
    // reproduces the same output forever.
    expect(reviewNextCommand({ result: "failed", taskId: "T009", scopeBasis: basis() })).toBe(
      "visp-kit review --task T009 --base <git-ref>"
    );
  });

  it("keeps the ordinary repair when the review failed on real findings", () => {
    expect(
      reviewNextCommand({
        result: "failed",
        taskId: "T009",
        scopeBasis: basis({ empty: false, reviewableFiles: ["src/app.ts"] })
      })
    ).toBe("visp-kit verify --task T009");
  });

  it("does not point a base-range review back at a base range it already has", () => {
    expect(
      reviewNextCommand({
        result: "failed",
        taskId: null,
        scopeBasis: basis({ kind: "base-range", baseRef: "HEAD~1" })
      })
    ).toBe("visp-kit verify");
  });
});

describe("reviewFailureRecovery", () => {
  it("surfaces the blocking finding's own recommendation", () => {
    expect(
      reviewFailureRecovery({
        findings: [
          { severity: "warning", recommendation: "Ignore me." },
          { severity: "error", recommendation: "Re-run with `--base <git-ref>`." }
        ],
        fallbackCommand: "visp-kit verify --task T009"
      })
    ).toBe("Re-run with `--base <git-ref>`.");
  });

  it("falls back to the review's next command when nothing is blocking", () => {
    expect(
      reviewFailureRecovery({ findings: [], fallbackCommand: "visp-kit verify --task T009" })
    ).toBe("visp-kit verify --task T009");
  });
});
