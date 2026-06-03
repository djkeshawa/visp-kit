import { describe, expect, it } from "vitest";

import { followUpSuggestions } from "../../../src/reconcile/follow-up-tasks.js";

describe("follow-up suggestions", () => {
  it("suggests a task for unmapped files", () => {
    const suggestions = followUpSuggestions({
      taskId: "T001",
      changedFiles: [
        {
          path: "src/extra.ts",
          changeType: "added",
          additions: 1,
          deletions: 0,
          mappingStatus: "unmapped",
          isTestFile: false,
          isDependencyFile: false,
          isVispGeneratedFile: false,
          isAllowedByTask: false,
          isExpectedByTask: false,
          isForbiddenByTask: false,
          relatedTaskIds: [],
          relatedRequirementIds: [],
          relatedAcceptanceCriterionIds: [],
          notes: []
        }
      ],
      findings: []
    });

    expect(suggestions.join(" ")).toContain("src/extra.ts");
  });
});
