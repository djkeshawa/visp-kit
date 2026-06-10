import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { criticalRulesDigest } from "./shared-agent-rules.js";

export function renderVispTaskTemplate(strictness: StrictnessMode): string {
  return `${criticalRulesDigest(strictness)}
## Purpose

Use this workflow when the user asks to continue with the next Visp task or implement the current Visp task.

## Steps

1. Run \`visp status\`.
   - Output says Visp Kit is not initialized -> run \`visp agent bootstrap <target> --strictness strict\`, then restart at step 1.
2. Run \`visp gate next\`.
   - Result blocked -> run the command shown after \`Next:\`, then repeat step 2.
   - The \`Next:\` command is \`visp context --next\` or \`visp context <task-id>\` -> run it.
3. Run \`visp gate implement --task <task-id>\`.
   - Result blocked -> do NOT edit code. Run the command shown after \`Next:\`, then repeat step 3.
4. Open \`.visp/prompts/current-task.prompt.md\` and follow its Steps section exactly. It ends with \`visp done --task <task-id>\`.
5. Run \`visp next\` and report its output as your final status.

## What not to do

- Do not create a new feature, spec, plan, or task graph unless \`visp next\` says it is missing.
- Do not continue to another task unless the user explicitly asks to continue.
`;
}
