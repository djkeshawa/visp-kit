import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { type AgentWorkflowName, renderWorkflowTemplate } from "../agent-renderer.js";

export function renderClaudeCommand(
  workflow: AgentWorkflowName,
  strictness: StrictnessMode
): string {
  return `# /visp-${workflow}

Use this Claude Code command to follow Visp Kit for the ${workflow} workflow.

${renderWorkflowTemplate(workflow, strictness)}

Claude command rule: stop after one task unless the user explicitly asks to continue and Visp gates allow the next step.
`;
}
