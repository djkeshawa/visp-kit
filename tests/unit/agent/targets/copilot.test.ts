import { describe, expect, it } from "vitest";

import { copilotTargetFiles } from "../../../../src/agent/targets/copilot.js";

describe("copilot target", () => {
  it("renders Copilot repository and workflow instructions plus the rules file", () => {
    const files = copilotTargetFiles({
      targetPath: "/repo",
      strictness: "locked",
      useFallbackAgentsFile: false
    });

    // Normalize separators so the assertion holds on both POSIX and Windows.
    expect(files.map((file) => file.path.replace(/\\/g, "/"))).toEqual([
      "/repo/AGENTS.md",
      "/repo/.visp/prompts/visp-rules.md",
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
    }

    const rules = files[1]!;

    expect(rules.contents).toContain("visp verify");
    expect(rules.contents).toContain("visp review");
    expect(rules.contents).toContain("visp reconcile");
    expect(rules.contents).toContain("visp done");
  });

  it("uses AGENTS.visp.md when fallback guidance is requested", () => {
    const files = copilotTargetFiles({
      targetPath: "/repo",
      strictness: "standard",
      useFallbackAgentsFile: true
    });

    expect(files[0]?.path.replace(/\\/g, "/")).toBe("/repo/AGENTS.visp.md");
  });
});
