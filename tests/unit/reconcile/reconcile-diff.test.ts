import { describe, expect, it } from "vitest";

import { reconcileDiff } from "../../../src/reconcile/reconcile-diff.js";
import { validTaskGraph, validTraceabilityMatrix } from "../artifacts/fixtures.js";

describe("reconcile diff", () => {
  it("maps allowed files to the selected task", () => {
    const result = reconcileDiff({
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
      taskGraph: validTaskGraph,
      traceability: validTraceabilityMatrix
    });

    expect(result.changedFiles[0]).toMatchObject({
      mappingStatus: "mapped",
      relatedTaskIds: ["T001"],
      relatedRequirementIds: ["REQ-001"]
    });
  });

  it("marks forbidden files as blocking errors", () => {
    const result = reconcileDiff({
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

    expect(result.fileMapping.status).toBe("failed");
    expect(result.findings[0]?.driftType).toBe("changed_forbidden_file");
  });

  it("marks unmapped source files as warnings when allowedFiles is empty", () => {
    const result = reconcileDiff({
      files: [
        {
          path: "src/extra.ts",
          changeType: "added",
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
      task: { ...validTaskGraph.tasks[0]!, allowedFiles: [] },
      taskGraph: validTaskGraph
    });

    expect(result.fileMapping.status).toBe("warnings");
    expect(result.findings[0]?.driftType).toBe("unmapped_file_change");
  });
});
