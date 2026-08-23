import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { type AgentTextFile } from "../agent-file-plan.js";
import { cursorRulePath, vispRulesFilePath } from "../agent-paths.js";
import { agentWorkflowNames, renderCursorBaseRule, renderCursorRule } from "../agent-renderer.js";
import { renderVispRulesFile } from "../templates/visp-rules.js";

export function cursorTargetFiles(input: {
  readonly targetPath: string;
  readonly strictness: StrictnessMode;
  readonly memoryDetected: boolean;
}): readonly AgentTextFile[] {
  return [
    {
      kind: "text",
      path: cursorRulePath(input.targetPath, "visp-rules"),
      contents: renderCursorBaseRule({
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
      path: cursorRulePath(input.targetPath, `visp-${workflow}`),
      contents: renderCursorRule(workflow, input.strictness)
    }))
  ];
}
