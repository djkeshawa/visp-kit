import { describe, expect, it } from "vitest";

import { codexTargetFiles } from "../../../../src/agent/targets/codex.js";

describe("codex target", () => {
  it("renders AGENTS.md and five Visp skills with strict guidance", () => {
    const files = codexTargetFiles({
      targetPath: "/repo",
      strictness: "strict",
      useFallbackAgentsFile: false
    });

    expect(files.map((file) => file.path)).toEqual([
      "/repo/AGENTS.md",
      "/repo/.agents/skills/visp-feature/SKILL.md",
      "/repo/.agents/skills/visp-task/SKILL.md",
      "/repo/.agents/skills/visp-fix/SKILL.md",
      "/repo/.agents/skills/visp-review/SKILL.md",
      "/repo/.agents/skills/visp-pr/SKILL.md"
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
    const files = codexTargetFiles({
      targetPath: "/repo",
      strictness: "standard",
      useFallbackAgentsFile: true
    });

    expect(files[0]?.path).toBe("/repo/AGENTS.visp.md");
  });
});
