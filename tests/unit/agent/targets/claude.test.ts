import { describe, expect, it } from "vitest";

import { claudeTargetFiles } from "../../../../src/agent/targets/claude.js";

describe("claude target", () => {
  it("renders the rules file and Claude command files with strict Visp guidance", () => {
    const files = claudeTargetFiles({
      targetPath: "/repo",
      strictness: "strict"
    });

    expect(files.map((file) => file.path)).toEqual([
      "/repo/.visp/prompts/visp-rules.md",
      "/repo/.claude/commands/visp-feature.md",
      "/repo/.claude/commands/visp-task.md",
      "/repo/.claude/commands/visp-fix.md",
      "/repo/.claude/commands/visp-review.md",
      "/repo/.claude/commands/visp-pr.md"
    ]);

    for (const file of files) {
      expect(file.contents).toContain("user prompt is raw intent");
      expect(file.contents).toContain("visp gate");
      expect(file.contents).toContain("visp done");
    }

    const rules = files[0]!;

    expect(rules.contents).toContain("visp verify");
    expect(rules.contents).toContain("visp review");
    expect(rules.contents).toContain("visp reconcile");
    expect(rules.contents).toContain("Reading gate output");

    for (const command of files.slice(1)) {
      expect(command.contents).toContain("## Rules digest");
      expect(command.contents).toContain(".visp/prompts/visp-rules.md");
    }
  });
});
