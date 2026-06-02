import { describe, expect, it } from "vitest";

import { reviewDependencies } from "../../../src/review/dependency-review.js";
import { validTaskGraph } from "../artifacts/fixtures.js";

const packageFile = {
  path: "package.json",
  changeType: "modified" as const,
  additions: 1,
  deletions: 0,
  inAllowedFiles: false,
  inExpectedFiles: false,
  inForbiddenFiles: false,
  isDependencyFile: true,
  isTestFile: false,
  isGeneratedVispFile: false,
  isBinary: false,
  diffTruncated: false,
  diff: ""
};

describe("dependency review", () => {
  it("fails package.json changes without approval", () => {
    const result = reviewDependencies({
      changedFiles: [packageFile],
      task: validTaskGraph.tasks[0]
    });

    expect(result.dependencyReview.status).toBe("failed");
    expect(result.findings[0]?.severity).toBe("error");
  });

  it("warns package.json changes with task approval", () => {
    const result = reviewDependencies({
      changedFiles: [packageFile],
      task: {
        ...validTaskGraph.tasks[0]!,
        allowedFiles: ["src/notes/sort.ts", "package.json"]
      }
    });

    expect(result.dependencyReview.status).toBe("warnings");
    expect(result.findings[0]?.severity).toBe("warning");
  });
});
