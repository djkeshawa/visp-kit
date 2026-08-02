import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { criticalRulesDigest } from "./shared-agent-rules.js";

export function renderVispPrTemplate(strictness: StrictnessMode): string {
  return `${criticalRulesDigest(strictness)}
## Purpose

Use this workflow when the user asks to prepare a PR.

## Steps

1. Run \`visp-kit status\`.
2. Run \`visp-kit gate pr\`.
   - Result blocked -> stop. Report the exact missing steps from the gate output and the command shown after \`Next:\`.
3. Run \`visp-kit pr\`.
4. Read \`.visp/features/<feature>/pr.md\` and summarize PR readiness honestly.

## PR rules

- Do not claim verification passed unless Visp evidence says it passed.
- Do not call GitHub API.
- Do not commit, push, tag, publish, or open a browser.
- Do not hide warnings or follow-up work.

## What not to do

- Do not create a normal PR summary when \`visp-kit gate pr\` blocks.
- Do not invent requirements, tests, or validation evidence.
`;
}
