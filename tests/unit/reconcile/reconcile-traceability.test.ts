import { describe, expect, it } from "vitest";

import { updateTraceabilityForReconcile } from "../../../src/reconcile/reconcile-traceability.js";
import { timestamp, validTaskGraph, validTraceabilityMatrix } from "../artifacts/fixtures.js";

describe("reconcile traceability", () => {
  it("adds changed files to the matching requirement/task link", () => {
    const updated = updateTraceabilityForReconcile({
      traceability: validTraceabilityMatrix,
      task: validTaskGraph.tasks[0],
      changedFiles: [
        {
          path: "src/notes/new.ts",
          changeType: "added",
          additions: 1,
          deletions: 0,
          mappingStatus: "mapped",
          isTestFile: false,
          isDependencyFile: false,
          isVispGeneratedFile: false,
          isAllowedByTask: true,
          isExpectedByTask: false,
          isForbiddenByTask: false,
          relatedTaskIds: ["T001"],
          relatedRequirementIds: ["REQ-001"],
          relatedAcceptanceCriterionIds: ["AC-001"],
          notes: []
        }
      ],
      result: "passed",
      now: timestamp
    });

    expect(updated.entries[0]?.filePaths).toContain("src/notes/new.ts");
    expect(updated.entries[0]?.status).toBe("verified");
  });

  it("preserves existing test refs while adding new test evidence", () => {
    const updated = updateTraceabilityForReconcile({
      traceability: {
        ...validTraceabilityMatrix,
        entries: [
          {
            ...validTraceabilityMatrix.entries[0]!,
            testRefs: ["existing:test"]
          }
        ]
      },
      task: validTaskGraph.tasks[0],
      changedFiles: [
        {
          path: "tests/notes/new.test.ts",
          changeType: "added",
          additions: 1,
          deletions: 0,
          mappingStatus: "mapped",
          isTestFile: true,
          isDependencyFile: false,
          isVispGeneratedFile: false,
          isAllowedByTask: false,
          isExpectedByTask: true,
          isForbiddenByTask: false,
          relatedTaskIds: ["T001"],
          relatedRequirementIds: ["REQ-001"],
          relatedAcceptanceCriterionIds: ["AC-001"],
          notes: []
        }
      ],
      result: "warnings",
      now: timestamp
    });

    expect(updated.entries[0]?.testPaths).toContain("tests/notes/new.test.ts");
    expect(updated.entries[0]?.testRefs).toEqual([
      "changed:tests/notes/new.test.ts",
      "existing:test"
    ]);
    expect(updated.entries[0]?.status).toBe("partial");
  });
});
