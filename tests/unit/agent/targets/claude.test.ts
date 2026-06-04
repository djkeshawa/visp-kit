import { describe, expect, it } from "vitest";

import { claudeTargetFiles } from "../../../../src/agent/targets/claude.js";

describe("claude target", () => {
  it("renders Claude command files with strict Visp guidance", () => {
    const files = claudeTargetFiles({
      targetPath: "/repo",
      strictness: "strict"
    });

    expect(files.map((file) => file.path)).toEqual([
      "/repo/.claude/commands/visp-feature.md",
      "/repo/.claude/commands/visp-task.md",
      "/repo/.claude/commands/visp-fix.md",
      "/repo/.claude/commands/visp-review.md",
      "/repo/.claude/commands/visp-pr.md"
    ]);

    for (const file of files) {
      expect(file.contents).toContain("user prompt is raw intent");
      expect(file.contents).toContain("visp gate");
      expect(file.contents).toContain("visp verify");
      expect(file.contents).toContain("visp review");
      expect(file.contents).toContain("visp reconcile");
    }
  });
});
