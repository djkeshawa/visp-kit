import { describe, expect, it } from "vitest";

import { copilotTargetFiles } from "../../../../src/agent/targets/copilot.js";

describe("copilot target", () => {
  it("renders Copilot repository and workflow instructions", () => {
    const files = copilotTargetFiles({
      targetPath: "/repo",
      strictness: "locked",
      useFallbackAgentsFile: false
    });

    expect(files.map((file) => file.path)).toEqual([
      "/repo/AGENTS.md",
      "/repo/.github/copilot-instructions.md",
      "/repo/.github/instructions/visp-feature.instructions.md",
      "/repo/.github/instructions/visp-task.instructions.md",
      "/repo/.github/instructions/visp-fix.instructions.md",
      "/repo/.github/instructions/visp-review.instructions.md",
      "/repo/.github/instructions/visp-pr.instructions.md"
    ]);

    for (const file of files) {
      expect(file.contents).toContain("user prompt is raw intent");
      expect(file.contents).toContain("visp gate");
      expect(file.contents).toContain("visp verify");
      expect(file.contents).toContain("visp review");
      expect(file.contents).toContain("visp reconcile");
    }
  });

  it("uses AGENTS.visp.md when fallback guidance is requested", () => {
    const files = copilotTargetFiles({
      targetPath: "/repo",
      strictness: "standard",
      useFallbackAgentsFile: true
    });

    expect(files[0]?.path).toBe("/repo/AGENTS.visp.md");
  });
});
