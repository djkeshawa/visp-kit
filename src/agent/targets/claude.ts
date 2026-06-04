import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { claudeCommandPath } from "../agent-paths.js";
import { agentWorkflowNames } from "../agent-renderer.js";
import { type AgentTextFile } from "../agent-file-plan.js";
import { renderClaudeCommand } from "../templates/claude-command-template.js";

export function claudeTargetFiles(input: {
  readonly targetPath: string;
  readonly strictness: StrictnessMode;
}): readonly AgentTextFile[] {
  return agentWorkflowNames.map((workflow) => ({
    kind: "text" as const,
    path: claudeCommandPath(input.targetPath, workflow),
    contents: renderClaudeCommand(workflow, input.strictness)
  }));
}
