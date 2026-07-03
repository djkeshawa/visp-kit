import { describe, expect, it } from "vitest";

import { cursorTargetFiles } from "../../../../src/agent/targets/cursor.js";
import { toPosixPath } from "../../../../src/core/paths.js";

describe("cursor target", () => {
  it("renders the base rule, shared rules file, and five workflow rules", () => {
    const files = cursorTargetFiles({
      targetPath: "/repo",
      strictness: "strict"
    });

    expect(files.map((file) => toPosixPath(file.path))).toEqual([
      "/repo/.cursor/rules/visp-rules.mdc",
      "/repo/.visp/prompts/visp-rules.md",
      "/repo/.cursor/rules/visp-feature.mdc",
      "/repo/.cursor/rules/visp-task.mdc",
      "/repo/.cursor/rules/visp-fix.mdc",
      "/repo/.cursor/rules/visp-review.mdc",
      "/repo/.cursor/rules/visp-pr.mdc"
    ]);

    for (const file of files) {
      expect(file.contents).toContain("visp gate");
    }

    const baseRule = files[0]!;

    expect(baseRule.contents).toContain("alwaysApply: true");
    expect(baseRule.contents).toContain("user prompt is raw intent");
    expect(baseRule.contents).toContain("visp done");

    const workflowRules = files.slice(2);

    for (const file of workflowRules) {
      expect(file.contents).toContain("alwaysApply: false");
      expect(file.contents).toContain("description:");
      expect(file.contents).toContain("user prompt is raw intent");
      expect(file.contents).toContain("visp done");
    }
  });
});
