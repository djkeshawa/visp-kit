import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import {
  agentsMarkdownPath,
  agentsVispMarkdownPath,
  copilotInstructionsPath,
  copilotWorkflowInstructionPath,
  vispRulesFilePath
} from "../agent-paths.js";
import {
  agentWorkflowNames,
  renderAgentsMarkdown,
  renderWorkflowTemplate
} from "../agent-renderer.js";
import { type AgentTextFile } from "../agent-file-plan.js";
import { renderCopilotInstructions } from "../templates/copilot-instruction-template.js";
import { renderVispRulesFile } from "../templates/visp-rules.js";

function renderCopilotWorkflowInstruction(input: {
  readonly workflow: (typeof agentWorkflowNames)[number];
  readonly strictness: StrictnessMode;
}): string {
  return `# Visp ${input.workflow} instructions

These instructions guide Copilot-compatible surfaces. If the current Copilot surface does not automatically load this file, copy it into the active session.

${renderWorkflowTemplate(input.workflow, input.strictness)}`;
}

export function copilotTargetFiles(input: {
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
        target: "copilot",
        strictness: input.strictness,
        memoryDetected: input.memoryDetected
      })
    },
    {
      kind: "text",
      path: vispRulesFilePath(input.targetPath),
      contents: renderVispRulesFile(input.strictness)
    },
    {
      kind: "text",
      path: copilotInstructionsPath(input.targetPath),
      contents: renderCopilotInstructions(input.strictness)
    },
    ...agentWorkflowNames.map((workflow) => ({
      kind: "text" as const,
      path: copilotWorkflowInstructionPath(input.targetPath, workflow),
      contents: renderCopilotWorkflowInstruction({
        workflow,
        strictness: input.strictness
      })
    }))
  ];
}
