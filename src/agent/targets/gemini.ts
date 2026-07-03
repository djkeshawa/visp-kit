import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { type AgentTextFile } from "../agent-file-plan.js";
import {
  geminiCommandPath,
  geminiMarkdownPath,
  geminiVispMarkdownPath,
  vispRulesFilePath
} from "../agent-paths.js";
import {
  agentWorkflowNames,
  renderAgentsMarkdown,
  renderGeminiCommand
} from "../agent-renderer.js";
import { renderVispRulesFile } from "../templates/visp-rules.js";

export function geminiTargetFiles(input: {
  readonly targetPath: string;
  readonly strictness: StrictnessMode;
  readonly useFallbackAgentsFile: boolean;
}): readonly AgentTextFile[] {
  const guidancePath = input.useFallbackAgentsFile
    ? geminiVispMarkdownPath(input.targetPath)
    : geminiMarkdownPath(input.targetPath);

  return [
    {
      kind: "text",
      path: guidancePath,
      contents: renderAgentsMarkdown({
        target: "gemini",
        strictness: input.strictness
      })
    },
    {
      kind: "text",
      path: vispRulesFilePath(input.targetPath),
      contents: renderVispRulesFile(input.strictness)
    },
    ...agentWorkflowNames.map((workflow) => ({
      kind: "text" as const,
      path: geminiCommandPath(input.targetPath, `visp-${workflow}`),
      contents: renderGeminiCommand(workflow, input.strictness)
    }))
  ];
}
