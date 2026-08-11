import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { claudePreToolUseHookPath, hooksReadmePath, vispRulesFilePath } from "../agent-paths.js";
import { type AgentTextFile } from "../agent-file-plan.js";
import { renderVispRulesFile } from "../templates/visp-rules.js";
import { renderClaudePreToolUseHook, renderHooksReadme } from "../hooks/hook-templates.js";

// P10-US-06: Kit no longer renders `.claude/commands/visp-*.md`. Installed
// slash commands are Hyper-owned — one file per verb, one owner — so no two
// installed commands can share a verb word with different authority. Kit keeps
// its rules file and hooks, which carry Kit's own authority.
export function claudeTargetFiles(input: {
  readonly targetPath: string;
  readonly strictness: StrictnessMode;
}): readonly AgentTextFile[] {
  return [
    {
      kind: "text" as const,
      path: vispRulesFilePath(input.targetPath),
      contents: renderVispRulesFile(input.strictness)
    },
    {
      kind: "text" as const,
      path: claudePreToolUseHookPath(input.targetPath),
      contents: renderClaudePreToolUseHook()
    },
    {
      kind: "text" as const,
      path: hooksReadmePath(input.targetPath),
      contents: renderHooksReadme()
    }
  ];
}
