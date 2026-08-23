import { describe, expect, it } from "vitest";

import { geminiTargetFiles } from "../../../../src/agent/targets/gemini.js";
import { toPosixPath } from "../../../../src/core/paths.js";

describe("gemini target", () => {
  it("renders GEMINI.md, the rules file, and five Gemini CLI commands", () => {
    const files = geminiTargetFiles({
      targetPath: "/repo",
      strictness: "strict",
      useFallbackAgentsFile: false,
      memoryDetected: false
    });

    expect(files.map((file) => toPosixPath(file.path))).toEqual([
      "/repo/GEMINI.md",
      "/repo/.visp/prompts/visp-rules.md",
      "/repo/.gemini/commands/visp-feature.toml",
      "/repo/.gemini/commands/visp-task.toml",
      "/repo/.gemini/commands/visp-fix.toml",
      "/repo/.gemini/commands/visp-review.toml",
      "/repo/.gemini/commands/visp-pr.toml"
    ]);

    for (const file of files) {
      expect(file.contents).toContain("user prompt is raw intent");
      expect(file.contents).toContain("visp-kit gate");
      expect(file.contents).toContain("visp-kit done");
    }

    const guidance = files[0]!;

    expect(guidance.contents).toContain("Gemini CLI");

    const commands = files.slice(2);

    for (const file of commands) {
      expect(file.contents).toContain('description = "');
      expect(file.contents).toContain('prompt = """');
      expect(file.contents).toContain("{{args}}");
      expect(file.contents).not.toContain('""""');
    }
  });

  it("uses GEMINI.visp.md when fallback guidance is requested", () => {
    const files = geminiTargetFiles({
      targetPath: "/repo",
      strictness: "standard",
      useFallbackAgentsFile: true,
      memoryDetected: false
    });

    expect(toPosixPath(files[0]?.path ?? "")).toBe("/repo/GEMINI.visp.md");
  });
});
