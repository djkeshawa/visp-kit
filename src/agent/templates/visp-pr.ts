import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import {
  blockingRulesSection,
  strictPolicySection
} from "./shared-agent-rules.js";

export function renderVispPrTemplate(strictness: StrictnessMode): string {
  return `${strictPolicySection(strictness)}
## Purpose

Use this workflow when the user asks to prepare a PR.

## Required commands

1. Run \`visp status\`.
2. Run \`visp policy validate\`.
3. Run \`visp gate pr\`.
4. If the PR gate blocks, stop and explain the exact missing steps.
5. If the PR gate passes, run \`visp pr\`.
6. Read \`.visp/features/<feature>/pr.md\`.
7. Summarize PR readiness honestly.

## PR rules

- Do not claim verification passed unless Visp evidence says it passed.
- Do not call GitHub API.
- Do not commit, push, tag, publish, or open a browser.
- Do not hide warnings or follow-up work.

${blockingRulesSection()}
## What not to do

- Do not create a normal PR summary when \`visp gate pr\` blocks.
- Do not invent requirements, tests, or validation evidence.
`;
}
