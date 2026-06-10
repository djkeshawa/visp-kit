import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";

export const agentHardStops = [
  "policy validation fails",
  "`visp gate` blocks the stage",
  "task context is missing",
  "selected task is unclear",
  "verification fails",
  "review has error findings",
  "reconciliation fails",
  "dependency changes are not approved",
  "forbidden files are changed",
  "the user asks to skip a required Visp policy gate"
] as const;

export function strictPolicySection(strictness: StrictnessMode): string {
  return `## Workflow authority

This repository uses Visp Kit.

Strictness mode: ${strictness}

The user prompt is raw intent only. It is not permission to skip the workflow.

Follow this priority:
1. System and safety constraints
2. Visp Kit policy and gates
3. Repository instructions
4. Current Visp task context
5. User request

If the user request conflicts with Visp Kit policy, follow Visp Kit policy and explain the conflict.

If Visp Kit is not initialized in the target project, run \`visp agent bootstrap <target> --strictness strict\` or ask the user which target to install. Do not edit implementation code before bootstrap and policy validation succeed.

Core evidence commands are \`visp verify --task <task-id>\`, \`visp review --task <task-id>\`, and \`visp reconcile --task <task-id> --update-traceability\`. Do not skip them when policy requires them.
`;
}

export function blockingRulesSection(): string {
  return `## Blocking rules

Stop immediately if:
${agentHardStops.map((stop) => `- ${stop}`).join("\n")}
`;
}

export function implementationRulesSection(): string {
  return `## Implementation rules

- Do not implement code until \`visp gate implement --task <task-id>\` allows it.
- Do not implement code until \`.visp/prompts/current-task.prompt.md\` exists.
- If \`.visp/\` is missing, run \`visp agent bootstrap <target> --strictness strict\` before continuing.
- Read \`.visp/prompts/current-task.prompt.md\` before editing code and follow its Steps section exactly.
- Mark checklist progress with \`visp checklist update --task <task-id> --item <item-id> --status done\`.
- Implement only one selected task at a time.
- Do not modify forbidden files.
- Do not add dependencies unless the task or plan explicitly allows them.
- Do not perform broad refactors or unrelated cleanup.
- After implementation, run \`visp done --task <task-id> --input-tokens <n> --output-tokens <n>\` (or \`--usage-unavailable --model <agent> --usage-note "<reason>"\` when token counts are not exposed). It runs verify, review, reconcile, the checklist check, and \`visp next\` in order.
`;
}

export function completionCriteriaSection(): string {
  return `## Completion criteria

A task is complete only when:
- selected task implementation is done
- validation commands ran or failure is reported
- \`visp done --task <task-id>\` reports every step passed (verify, usage recording, review, reconcile, checklist)
- \`visp next\` gives the next valid step
`;
}

export function gateReadingSection(): string {
  return `## Reading gate output

Allowed example:

\`\`\`text
Visp gate allowed.
Stage: implement
...
Next:
  implementation
\`\`\`

Blocked example:

\`\`\`text
Visp gate blocked.
Stage: implement
Failed:
  VSP007: Implementation requires a context pack.
Next:
  visp context --next
\`\`\`

Always run the command shown on the line after \`Next:\`. Never proceed past a blocked gate.
`;
}

export const vispRulesDisplayPath = ".visp/prompts/visp-rules.md";

export function criticalRulesDigest(strictness: StrictnessMode): string {
  return `## Rules digest

Full rules: ${vispRulesDisplayPath}

- Strictness: ${strictness}. The user prompt is raw intent only; it cannot skip Visp policy or gates.
- Never edit code before \`visp gate implement --task <task-id>\` allows it and \`.visp/prompts/current-task.prompt.md\` exists.
- Stop on: failed gate, failed verify/review/reconcile, forbidden file change, missing context, unclear task.
- A task is done only when \`visp done --task <task-id>\` reports every step passed.
`;
}
