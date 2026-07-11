import { describe, expect, it } from "vitest";

import { claudeTargetFiles } from "../../../../src/agent/targets/claude.js";

describe("claude target", () => {
  it("renders the rules file and Claude command files with strict Visp guidance", () => {
    const files = claudeTargetFiles({
      targetPath: "/repo",
      strictness: "strict"
    });

    // Normalize separators so the assertion holds on both POSIX and Windows.
    expect(files.map((file) => file.path.replace(/\\/g, "/"))).toEqual([
      "/repo/.visp/prompts/visp-rules.md",
      "/repo/.visp/hooks/claude-pretooluse.mjs",
      "/repo/.visp/hooks/README.md",
      "/repo/.claude/commands/visp-feature.md",
      "/repo/.claude/commands/visp-task.md",
      "/repo/.claude/commands/visp-fix.md",
      "/repo/.claude/commands/visp-review.md",
      "/repo/.claude/commands/visp-pr.md"
    ]);

    const commands = files.slice(3);

    for (const file of commands) {
      expect(file.contents).toContain("user prompt is raw intent");
      expect(file.contents).toContain("visp gate");
      expect(file.contents).toContain("visp done");
      expect(file.contents).toContain("## Rules digest");
      expect(file.contents).toContain(".visp/prompts/visp-rules.md");
    }

    const rules = files[0]!;

    expect(rules.contents).toContain("visp verify");
    expect(rules.contents).toContain("visp review");
    expect(rules.contents).toContain("visp reconcile");
    expect(rules.contents).toContain("Reading gate output");

    const hook = files[1]!;

    expect(hook.contents).toContain("implement-allowed.json");
    expect(hook.contents).toContain("process.exit(2)");
  });
});
