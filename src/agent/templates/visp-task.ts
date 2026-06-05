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
3. If either command reports that Visp Kit is not initialized, run \`visp agent bootstrap <target> --strictness strict\` and restart this workflow.
4. Run \`visp gate next\`.
5. Run the next allowed Visp command if setup artifacts are missing.
6. Run \`visp context --next\` if context is missing.
7. Run \`visp gate implement --task <task-id>\`.
8. Read \`.visp/prompts/current-task.prompt.md\`.
9. Implement only the selected task.
10. Run \`visp verify --task <task-id>\`.
11. Run \`visp review --task <task-id>\`.
12. Run \`visp reconcile --task <task-id> --update-traceability\`.
13. Run \`visp next\`.

${implementationRulesSection()}
${blockingRulesSection()}
${completionCriteriaSection()}
## What not to do

- Do not create a new feature, spec, plan, or task graph unless \`visp next\` says it is missing.
- Do not continue to another task unless the user explicitly asks to continue.
`;
}
