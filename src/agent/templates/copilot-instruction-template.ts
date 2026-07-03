import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { blockingRulesSection, strictPolicySection } from "./shared-agent-rules.js";

export function renderCopilotInstructions(strictness: StrictnessMode): string {
  return `# Visp Kit Copilot Instructions

${strictPolicySection(strictness)}
## Before implementation

1. Check \`visp status\`.
2. Check \`visp next\`.
3. Run \`visp gate implement --task <task-id>\` before coding.
4. Do not implement until \`.visp/prompts/current-task.prompt.md\` exists.
5. Read \`.visp/prompts/current-task.prompt.md\`.
6. Implement only the selected task.

${blockingRulesSection()}
## Compatibility

Copilot support varies by surface. These files provide repository guidance for Copilot-compatible tools and can also be copied into the active Copilot chat/session when needed.
`;
}
