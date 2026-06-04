import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import {
  blockingRulesSection,
  strictPolicySection
} from "./shared-agent-rules.js";

export function renderVispReviewTemplate(strictness: StrictnessMode): string {
  return `${strictPolicySection(strictness)}
## Purpose

Use this workflow when the user asks for a review-only pass.

## Required commands

1. Run \`visp status\`.
2. Run \`visp policy validate\`.
3. Run \`visp gate review --task <task-id>\` where applicable.
4. Run \`visp review --task <task-id>\` if review is needed and the gate allows it.
5. Read the review report.
6. Summarize blocking issues and non-blocking suggestions.

## Review rules

- Do not edit code unless the user explicitly asks for a fix.
- If asked to fix, switch to the \`visp-fix\` workflow.
- Do not review unrelated files outside the selected task scope.
- Do not claim verification passed unless Visp evidence says it passed.

${blockingRulesSection()}
## What not to do

- Do not bypass \`visp gate review\`.
- Do not implement code during review-only mode.
`;
}
