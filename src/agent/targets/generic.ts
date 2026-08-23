import {
  agentsMarkdownPath,
  agentsVispMarkdownPath,
  genericAgentPromptPath,
  vispRulesFilePath
} from "../agent-paths.js";
import {
  agentWorkflowNames,
  renderAgentsMarkdown,
  renderGenericPrompt
} from "../agent-renderer.js";
import { type AgentTextFile } from "../agent-file-plan.js";
import { renderVispRulesFile } from "../templates/visp-rules.js";
import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";

export function genericTargetFiles(input: {
  readonly targetPath: string;
  readonly strictness: StrictnessMode;
  readonly useFallbackAgentsFile: boolean;
  readonly memoryDetected: boolean;
}): readonly AgentTextFile[] {
  const agentsPath = input.useFallbackAgentsFile
    ? agentsVispMarkdownPath(input.targetPath)
    : agentsMarkdownPath(input.targetPath);

  return [
    {
      kind: "text",
      path: agentsPath,
      contents: renderAgentsMarkdown({
        target: "generic",
        strictness: input.strictness,
        memoryDetected: input.memoryDetected
      })
    },
    {
      kind: "text",
      path: vispRulesFilePath(input.targetPath),
      contents: renderVispRulesFile(input.strictness)
    },
    ...agentWorkflowNames.map((workflow) => ({
      kind: "text" as const,
      path: genericAgentPromptPath(input.targetPath, workflow),
      contents: renderGenericPrompt(workflow, input.strictness)
    }))
  ];
}
