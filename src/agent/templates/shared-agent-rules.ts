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
- Read \`.visp/prompts/current-task.prompt.md\` before editing code.
- Update \`.visp/features/<feature>/context/<task-id>.implementation-checklist.md\` as work progresses when that file exists.
- If your agent surface exposes token usage, record it after implementation with \`visp budget --task <task-id> --record-usage --input-tokens <n> --output-tokens <n> --write-report\`.
- Implement only one selected task at a time.
- Do not modify forbidden files.
- Do not add dependencies unless the task or plan explicitly allows them.
- Do not perform broad refactors or unrelated cleanup.
- Do not skip \`visp verify\`, \`visp review\`, or \`visp reconcile\`.
`;
}

export function completionCriteriaSection(): string {
  return `## Completion criteria

A task is complete only when:
- selected task implementation is done
- implementation checklist is updated or included in the final response
- actual token usage is recorded when the agent surface exposes it
- validation commands ran or failure is reported
- \`visp verify --task <task-id>\` passes
- \`visp review --task <task-id>\` has no blocking findings
- \`visp reconcile --task <task-id> --update-traceability\` passes
- \`visp next\` gives the next valid step
`;
}
