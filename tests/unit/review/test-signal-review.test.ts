import { describe, expect, it } from "vitest";

import { reviewTestSignals } from "../../../src/review/test-signal-review.js";
import { validTaskGraph } from "../artifacts/fixtures.js";

const sourceFile = {
  path: "src/notes/sort.ts",
  changeType: "modified" as const,
  additions: 1,
  deletions: 0,
  inAllowedFiles: true,
  inExpectedFiles: false,
  inForbiddenFiles: false,
  isDependencyFile: false,
  isTestFile: false,
  isGeneratedVispFile: false,
  isBinary: false,
  diffTruncated: false,
  diff: ""
};

describe("test signal review", () => {
  it("warns when behavior task has no test changes", () => {
    const result = reviewTestSignals({
      changedFiles: [sourceFile],
      task: validTaskGraph.tasks[0]
    });

    expect(result.testReview.status).toBe("warnings");
    expect(result.findings.some((finding) => finding.title === "No test files changed")).toBe(true);
  });

  it("does not warn for manual/static-only validation", () => {
    const result = reviewTestSignals({
      changedFiles: [sourceFile],
      task: validTaskGraph.tasks[0],
      spec: {
        featureId: "001",
        featureSlug: "note-pinning",
        title: "Add note pinning",
        status: "ready",
        userStories: [],
        requirements: [],
        acceptanceCriteria: [
          {
            id: "AC-001",
            requirementId: "REQ-001",
            description: "Manual validation",
            testable: true,
            validationMethod: "manual"
          }
        ],
        businessRules: [],
        nonFunctionalRequirements: {
          performance: [],
          security: [],
          accessibility: [],
          reliability: [],
          maintainability: []
        },
        edgeCases: [],
        assumptions: [],
        outOfScope: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    });

    expect(result.findings.some((finding) => finding.title === "No test files changed")).toBe(
      false
    );
  });
});
