import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import {
  blockingRulesSection,
  completionCriteriaSection,
  implementationRulesSection,
  strictPolicySection
} from "./shared-agent-rules.js";

export function renderVispTaskTemplate(strictness: StrictnessMode): string {
  return `${strictPolicySection(strictness)}
## Purpose

Use this workflow when the user asks to continue with the next Visp task or implement the current Visp task.

## Required commands

1. Run \`visp status\`.
2. Run \`visp policy validate\`.
3. Run \`visp gate next\`.
4. Run \`visp context --next\` if context is missing.
5. Run \`visp gate implement --task <task-id>\`.
6. Read \`.visp/prompts/current-task.prompt.md\`.
7. Implement only the selected task.
8. Run \`visp verify --task <task-id>\`.
9. Run \`visp review --task <task-id>\`.
10. Run \`visp reconcile --task <task-id> --update-traceability\`.
11. Run \`visp next\`.

${implementationRulesSection()}
${blockingRulesSection()}
${completionCriteriaSection()}
## What not to do

- Do not create a new feature, spec, plan, or task graph unless \`visp next\` says it is missing.
- Do not continue to another task unless the user explicitly asks to continue.
`;
}
