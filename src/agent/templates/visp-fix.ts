import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { criticalRulesDigest } from "./shared-agent-rules.js";

export function renderVispFixTemplate(strictness: StrictnessMode): string {
  return `${criticalRulesDigest(strictness)}
## Purpose

Use this workflow when verification, review, or reconciliation failed.

## Steps

1. Run \`visp-kit status\` and identify the active feature and selected task.
2. Read \`.visp/prompts/current-task.prompt.md\`.
3. Read the failing reports that exist:
   - \`.visp/features/<feature>/verification.md\`
   - \`.visp/features/<feature>/review/<task>.review.md\`
   - \`.visp/features/<feature>/reconcile/<task>.reconcile.md\`
4. Fix only the reported issues.
5. Run \`visp-kit done --task <task-id>\`.
   - A step FAILED -> fix only the newly reported issues, then repeat step 5.

## Repair rules

- Repair mode cannot add new functionality outside the selected task.
- Do not modify unrelated files.
- Do not broaden the task scope to make findings disappear.
- Do not add dependencies unless the selected task or plan explicitly allows them.

## What not to do

- Do not implement new feature scope.
- Do not skip failed report findings.
- Do not claim completion until Visp reports support it.
`;
}
