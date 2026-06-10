import {
  agentsMarkdownPath,
  agentsVispMarkdownPath,
  codexSkillPath,
  vispRulesFilePath
} from "../agent-paths.js";
import {
  agentWorkflowNames,
  renderAgentsMarkdown,
  renderCodexSkill
} from "../agent-renderer.js";
import { type AgentTextFile } from "../agent-file-plan.js";
import { renderVispRulesFile } from "../templates/visp-rules.js";
import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";

export function codexTargetFiles(input: {
  readonly targetPath: string;
  readonly strictness: StrictnessMode;
  readonly useFallbackAgentsFile: boolean;
}): readonly AgentTextFile[] {
  const agentsPath = input.useFallbackAgentsFile
    ? agentsVispMarkdownPath(input.targetPath)
    : agentsMarkdownPath(input.targetPath);

  return [
    {
      kind: "text",
      path: agentsPath,
      contents: renderAgentsMarkdown({
        target: "codex",
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
      path: codexSkillPath(input.targetPath, `visp-${workflow}`),
      contents: renderCodexSkill(workflow, input.strictness)
    }))
  ];
}
