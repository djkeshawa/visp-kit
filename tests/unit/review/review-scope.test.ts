import { describe, expect, it } from "vitest";

import { reviewScope } from "../../../src/review/review-scope.js";
import { validTaskGraph } from "../artifacts/fixtures.js";

describe("review scope", () => {
  it("passes allowed files", () => {
    const result = reviewScope({
      files: [
        {
          path: "src/notes/sort.ts",
          changeType: "modified",
          additions: 1,
          deletions: 0,
          isDependencyFile: false,
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

    expect(result.scopeReview.status).toBe("passed");
    expect(result.changedFiles[0]?.inAllowedFiles).toBe(true);
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

    expect(result.scopeReview.status).toBe("passed");
  });
});
