import { describe, expect, it } from "vitest";

import { type LoadedDiffFile } from "../../../src/review/diff-loader.js";
import { reviewScope } from "../../../src/review/review-scope.js";
import { validTaskGraph } from "../artifacts/fixtures.js";

describe("review scope", () => {
  const changedFile = (path: string, overrides: Partial<LoadedDiffFile> = {}): LoadedDiffFile => ({
    path,
    changeType: "modified",
    additions: 1,
    deletions: 0,
    isDependencyFile: false,
    isTestFile: false,
    isGeneratedVispFile: false,
    isBinary: false,
    diffTruncated: false,
    diff: "",
    ...overrides
  });

  it("passes allowed files", () => {
    const result = reviewScope({
      files: [changedFile("src/notes/sort.ts"), changedFile("tests/notes/sort.test.ts")],
      task: validTaskGraph.tasks[0],
      taskGraph: validTaskGraph
    });

    expect(result.scopeReview.status).toBe("passed");
    expect(result.changedFiles[0]?.inAllowedFiles).toBe(true);
    expect(result.scopeReview.reviewedExpectedFiles).toEqual(["tests/notes/sort.test.ts"]);
  });

  it("fails when none of the task's expected files were reviewed", () => {
    const result = reviewScope({
      files: [changedFile("src/notes/sort.ts")],
      task: validTaskGraph.tasks[0],
      taskGraph: validTaskGraph
    });

    expect(result.scopeReview.status).toBe("failed");
    expect(result.scopeReview.reviewedExpectedFiles).toEqual([]);
    expect(
      result.findings.some(
        (item) =>
          item.title === "Task's expected files were not reviewed" && item.severity === "error"
      )
    ).toBe(true);
  });

  it("flags forbidden files as errors", () => {
    const result = reviewScope({
      files: [
        {
          path: "package.json",
          changeType: "modified",
          additions: 1,
          deletions: 0,
          isDependencyFile: true,
          isTestFile: false,
          isGeneratedVispFile: false,
          isBinary: false,
          diffTruncated: false,
          diff: ""
        }
      ],
      task: validTaskGraph.tasks[0],
      taskGraph: validTaskGraph
    });

    expect(result.scopeReview.status).toBe("failed");
    expect(result.findings[0]?.severity).toBe("error");
  });

  it("ignores generated review files", () => {
    const result = reviewScope({
      files: [
        {
          path: ".visp/features/001-note-pinning/review/T001.review.md",
          changeType: "modified",
          additions: 1,
          deletions: 0,
          isDependencyFile: false,
          isTestFile: false,
          isGeneratedVispFile: true,
          isBinary: false,
          diffTruncated: false,
          diff: ""
        }
      ],
      task: validTaskGraph.tasks[0],
      taskGraph: validTaskGraph
    });

    // Generated Visp output is never a scope violation. The review still fails
    // here, because a diff of nothing but generated files contains none of the
    // task's expected work — a different finding, and the point of LC-130.
    expect(result.scopeReview.outOfScopeFiles).toEqual([]);
    expect(result.scopeReview.forbiddenChangedFiles).toEqual([]);
    expect(result.findings.some((item) => item.title === "Out-of-scope file changed")).toBe(false);
  });
});
