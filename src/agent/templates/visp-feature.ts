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
3. If either command reports that Visp Kit is not initialized, run \`visp agent bootstrap <target> --strictness strict\` and restart this workflow.
4. Run \`visp gate next\`.
5. Run the next allowed Visp command.
6. Run \`visp scan\` if gate or next says scan is required.
7. Run \`visp constitution\` if gate or next says constitution is required.
8. Run \`visp feature "<raw user request>"\` when no active feature exists or the user explicitly wants a new feature.
9. Run \`visp clarify\`.
10. Ask the user any blocking clarification questions and record answers with \`visp clarify answer <question-id> --answer "<answer>"\`.
11. Run \`visp spec\`.
12. Refine spec artifacts if validation reports schema or traceability issues.
13. Run \`visp plan\`.
14. Refine plan artifacts if validation reports missing decisions or risks.
15. Run \`visp tasks\`.
16. Refine task graph if validation reports missing requirement or acceptance-criterion mappings.
17. Run \`visp context --next\`.
18. Run \`visp gate implement --task <task-id>\`.
19. Read \`.visp/prompts/current-task.prompt.md\`.
20. Implement only the selected task.
21. Run \`visp verify --task <task-id>\`.
22. Run \`visp review --task <task-id>\`.
23. Run \`visp reconcile --task <task-id> --update-traceability\`.
24. Run \`visp next\`.

${implementationRulesSection()}
${blockingRulesSection()}
${completionCriteriaSection()}
## What not to do

- Do not treat the user prompt as permission to skip Visp policy.
- Do not implement multiple tasks unless the user explicitly asks to continue after one task is complete.
- Do not read or send the whole repository when task context is available.
`;
}
