import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import {
  blockingRulesSection,
  completionCriteriaSection,
  strictPolicySection
} from "./shared-agent-rules.js";

export function renderVispFixTemplate(strictness: StrictnessMode): string {
  return `${strictPolicySection(strictness)}
## Purpose

Use this workflow when verification, review, or reconciliation failed.

## Required commands

1. Run \`visp status\`.
2. Identify the active feature and selected task.
3. Read \`.visp/prompts/current-task.prompt.md\`.
4. Read \`.visp/features/<feature>/verification.md\` if present.
5. Read \`.visp/features/<feature>/review/<task>.review.md\` if present.
6. Read \`.visp/features/<feature>/reconcile/<task>.reconcile.md\` if present.
7. Fix only the reported issues.
8. Run \`visp verify --task <task-id>\`.
9. Run \`visp review --task <task-id>\`.
10. Run \`visp reconcile --task <task-id> --update-traceability\`.

## Repair rules

- Repair mode cannot add new functionality outside the selected task.
- Do not modify unrelated files.
- Do not broaden the task scope to make findings disappear.
- Do not add dependencies unless the selected task or plan explicitly allows them.

${blockingRulesSection()}
${completionCriteriaSection()}
## What not to do

- Do not implement new feature scope.
- Do not skip failed report findings.
- Do not claim completion until Visp reports support it.
`;
}
