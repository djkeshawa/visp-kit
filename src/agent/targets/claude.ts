import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import {
  claudeCommandPath,
  claudePreToolUseHookPath,
  hooksReadmePath,
  vispRulesFilePath
} from "../agent-paths.js";
import { agentWorkflowNames } from "../agent-renderer.js";
import { type AgentTextFile } from "../agent-file-plan.js";
import { renderClaudeCommand } from "../templates/claude-command-template.js";
import { renderVispRulesFile } from "../templates/visp-rules.js";
import { renderClaudePreToolUseHook, renderHooksReadme } from "../hooks/hook-templates.js";

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
    },
    ...agentWorkflowNames.map((workflow) => ({
      kind: "text" as const,
      path: claudeCommandPath(input.targetPath, workflow),
      contents: renderClaudeCommand(workflow, input.strictness)
    }))
  ];
}
