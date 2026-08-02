import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { criticalRulesDigest } from "./shared-agent-rules.js";

export function renderVispReviewTemplate(strictness: StrictnessMode): string {
  return `${criticalRulesDigest(strictness)}
## Purpose

Use this workflow when the user asks for a review-only pass.

## Steps

1. Run \`visp-kit status\`.
2. Run \`visp-kit gate review --task <task-id>\`.
   - Result blocked -> stop. Report the command shown after \`Next:\` and wait for the user.
3. Run \`visp-kit review --task <task-id>\`.
4. Read the review report and summarize blocking issues and non-blocking suggestions.

## Review rules

- Do not edit code unless the user explicitly asks for a fix.
- If asked to fix, switch to the \`visp-fix\` workflow.
- Do not review unrelated files outside the selected task scope.
- Do not claim verification passed unless Visp evidence says it passed.

## What not to do

- Do not bypass \`visp-kit gate review\`.
- Do not implement code during review-only mode.
`;
}
