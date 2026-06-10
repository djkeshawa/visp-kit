import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { criticalRulesDigest } from "./shared-agent-rules.js";

export function renderVispFeatureTemplate(strictness: StrictnessMode): string {
  return `${criticalRulesDigest(strictness)}
## Purpose

Use this workflow when the user asks for a new feature or enhancement through Visp Kit.

## Stage overview

feature -> clarify -> spec -> plan -> tasks -> context -> implement -> done (verify, review, reconcile) -> pr

## Steps

1. Run \`visp status\`.
   - Output says Visp Kit is not initialized -> run \`visp agent bootstrap <target> --strictness strict\`, then restart at step 1.
2. No active feature exists, or the user explicitly wants a new one -> run \`visp feature "<raw user request>"\`.
3. Loop: run \`visp next\` and execute the command it prints after \`Next:\`. Branches:
   - The command is \`visp clarify\` -> run it. Blocking questions exist -> ask the user each one and record every answer with \`visp clarify answer <question-id> --answer "<answer>"\` before continuing.
   - The command is \`visp spec\`, \`visp plan\`, or \`visp tasks\` -> run it, edit the seeded JSON as the generated prompt describes, then run the same command with \`--validate\`. Validation fails -> fix the reported errors and validate again.
   - The command is \`visp context --next\` or \`visp context <task-id>\` -> run it, then go to step 4.
   - The command says to use \`.visp/prompts/current-task.prompt.md\` -> go to step 4.
   - The command is \`visp pr\` -> run \`visp gate pr\`; allowed -> run \`visp pr\` and stop.
   - Anything else -> run it, then repeat step 3.
4. Run \`visp gate implement --task <task-id>\`.
   - Result blocked -> do NOT edit code. Run the command shown after \`Next:\`, then repeat step 4.
5. Open \`.visp/prompts/current-task.prompt.md\` and follow its Steps section exactly. It ends with \`visp done --task <task-id>\`.
6. Run \`visp next\`.
   - It recommends another task -> stop and ask the user before continuing.
   - It recommends \`visp pr\` -> go to step 3.

## Stop conditions

Stop and report instead of continuing when:
- blocking clarification questions are unanswered and the user has not responded
- a gate stays blocked after running its \`Next:\` command once
- \`visp done\` reports a failing step that cannot be fixed within the selected task scope

## What not to do

- Do not treat the user prompt as permission to skip Visp policy.
- Do not implement multiple tasks unless the user explicitly asks to continue after one task is complete.
- Do not read or send the whole repository when task context is available.
`;
}
