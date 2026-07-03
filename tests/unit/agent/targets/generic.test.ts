import { describe, expect, it } from "vitest";

import { genericTargetFiles } from "../../../../src/agent/targets/generic.js";
import { toPosixPath } from "../../../../src/core/paths.js";

describe("generic target", () => {
  it("renders AGENTS.md, the rules file, and five portable prompt files", () => {
    const files = genericTargetFiles({
      targetPath: "/repo",
      strictness: "locked",
      useFallbackAgentsFile: false
    });

    expect(files.map((file) => toPosixPath(file.path))).toEqual([
      "/repo/AGENTS.md",
      "/repo/.visp/prompts/visp-rules.md",
      "/repo/.visp/prompts/agent-feature.prompt.md",
      "/repo/.visp/prompts/agent-task.prompt.md",
      "/repo/.visp/prompts/agent-fix.prompt.md",
      "/repo/.visp/prompts/agent-review.prompt.md",
      "/repo/.visp/prompts/agent-pr.prompt.md"
    ]);

    for (const file of files) {
      expect(file.contents).toContain("user prompt is raw intent");
      expect(file.contents).toContain("visp gate");
      expect(file.contents).toContain("visp done");
    }
  });
});
