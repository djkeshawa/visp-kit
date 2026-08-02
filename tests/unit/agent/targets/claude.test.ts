import { describe, expect, it } from "vitest";

import { claudeTargetFiles } from "../../../../src/agent/targets/claude.js";

describe("claude target", () => {
  // P10-US-06: Kit no longer renders `.claude/commands/visp-*.md` — installed
  // slash commands are Hyper-owned, one file per verb, one owner. Kit's claude
  // target is exactly its rules file plus hooks, which carry Kit's authority.
  it("renders only the rules file and hooks — no slash commands", () => {
    const files = claudeTargetFiles({
      targetPath: "/repo",
      strictness: "strict"
    });

    // Normalize separators so the assertion holds on both POSIX and Windows.
    expect(files.map((file) => file.path.replace(/\\/g, "/"))).toEqual([
      "/repo/.visp/prompts/visp-rules.md",
      "/repo/.visp/hooks/claude-pretooluse.mjs",
      "/repo/.visp/hooks/README.md"
    ]);

    const rules = files[0]!;

    expect(rules.contents).toContain("visp-kit verify");
    expect(rules.contents).toContain("visp-kit review");
    expect(rules.contents).toContain("visp-kit reconcile");
    expect(rules.contents).toContain("Reading gate output");

    const hook = files[1]!;

    expect(hook.contents).toContain("implement-allowed.json");
    expect(hook.contents).toContain("process.exit(2)");
  });
});
