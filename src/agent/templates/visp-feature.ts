import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import {
  blockingRulesSection,
  completionCriteriaSection,
  implementationRulesSection,
  strictPolicySection
} from "./shared-agent-rules.js";

export function renderVispFeatureTemplate(strictness: StrictnessMode): string {
  return `${strictPolicySection(strictness)}
## Purpose

Use this workflow when the user asks for a new feature or enhancement through Visp Kit.

## Required commands

1. Run \`visp status\`.
2. Run \`visp policy validate\`.
3. Run \`visp gate next\`.
4. Run the next allowed Visp command.
5. Run \`visp scan\` if gate or next says scan is required.
6. Run \`visp constitution\` if gate or next says constitution is required.
7. Run \`visp feature "<raw user request>"\` when no active feature exists or the user explicitly wants a new feature.
8. Run \`visp clarify\`.
9. Refine clarification artifacts if needed.
10. Run \`visp spec\`.
11. Refine spec artifacts if needed.
12. Run \`visp plan\`.
13. Refine plan artifacts if needed.
14. Run \`visp tasks\`.
15. Refine task graph if needed.
16. Run \`visp context --next\`.
17. Run \`visp gate implement --task <task-id>\`.
18. Read \`.visp/prompts/current-task.prompt.md\`.
19. Implement only the selected task.
20. Run \`visp verify --task <task-id>\`.
21. Run \`visp review --task <task-id>\`.
22. Run \`visp reconcile --task <task-id> --update-traceability\`.
23. Run \`visp next\`.

${implementationRulesSection()}
${blockingRulesSection()}
${completionCriteriaSection()}
## What not to do

- Do not treat the user prompt as permission to skip Visp policy.
- Do not implement multiple tasks unless the user explicitly asks to continue after one task is complete.
- Do not read or send the whole repository when task context is available.
`;
}
