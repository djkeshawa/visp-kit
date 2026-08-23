import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";

export const agentHardStops = [
  "policy validation fails",
  "`visp-kit gate` blocks the stage",
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

If Visp Kit is not initialized in the target project, run \`visp-kit agent bootstrap <target> --strictness strict\` or ask the user which target to install. Do not edit implementation code before bootstrap and policy validation succeed.

Core evidence commands are \`visp-kit verify --task <task-id>\`, \`visp-kit review --task <task-id>\`, and \`visp-kit reconcile --task <task-id> --update-traceability\`. Do not skip them when policy requires them.
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

- Do not implement code until \`visp-kit gate implement --task <task-id>\` allows it.
- Do not implement code until \`.visp/prompts/current-task.prompt.md\` exists.
- If \`.visp/\` is missing, run \`visp-kit agent bootstrap <target> --strictness strict\` before continuing.
- Read \`.visp/prompts/current-task.prompt.md\` before editing code and follow its Steps section exactly.
- Mark checklist progress with \`visp-kit checklist update --task <task-id> --item <item-id> --status done\`.
- Implement only one selected task at a time.
- Do not modify forbidden files.
- Do not add dependencies unless the task or plan explicitly allows them.
- Do not perform broad refactors or unrelated cleanup.
- After implementation, run \`visp-kit done --task <task-id> --input-tokens <n> --output-tokens <n>\` (or \`--usage-unavailable --model <agent> --usage-note "<reason>"\` when token counts are not exposed). It runs verify, review, reconcile, the checklist check, and \`visp-kit next\` in order.
`;
}

export function completionCriteriaSection(): string {
  return `## Completion criteria

A task is complete only when:
- selected task implementation is done
- validation commands ran or failure is reported
- \`visp-kit done --task <task-id>\` reports every step passed (verify, usage recording, review, reconcile, checklist)
- \`visp-kit next\` gives the next valid step
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
  visp-kit context --next
\`\`\`

Always run the command shown on the line after \`Next:\`. Never proceed past a blocked gate.
`;
}

export const vispRulesDisplayPath = ".visp/prompts/visp-rules.md";

/**
 * One command per capability, and no more.
 *
 * Two constraints meet here. `visp-memory`'s own reachability check counts an
 * instruction file as an entry point only when the executable is followed by a
 * real subcommand on the same line — naming the package in prose is reported as
 * "mentioned", not "reachable" — so at least one runnable form has to survive any
 * edit. Against that, this file is read on every task, so the section names the
 * capability and one way in, not the command surface.
 */
export const memoryEntryCommands = {
  recall: 'visp-memory recall "<topic>"',
  record: 'visp-memory record "<what happened>"',
  intent: 'visp-memory goal "<intent>"'
} as const;

/**
 * Memory is a sibling tool, not part of the gate. This section exists so an agent
 * learns memory is there at all — without it, nothing in a Kit-bootstrapped project
 * names `visp-memory` and the entry point is never found.
 *
 * Rendered only where memory was actually detected, so a project that does not use
 * it is not told to. The non-authoritative sentence is a contract, not a caveat:
 * Kit decides permission, scope, evidence and completion; memory supplies cited
 * knowledge and nothing else.
 */
export function memorySection(): string {
  return `## Memory (optional, non-authoritative)

\`visp-memory\` holds cited notes from earlier work on this project. It never grants permission, changes scope, certifies evidence, or marks work done — Visp Kit decides all of that. Treat what it returns as a claim to check, not as evidence.

- Recall what the project already knows, before planning: \`${memoryEntryCommands.recall}\`.
- Record what the work turned up, once it is real: \`${memoryEntryCommands.record}\`.
- Set the intent you are working toward: \`${memoryEntryCommands.intent}\`.

\`visp-memory --help\` lists the rest. Memory is never required to proceed.
`;
}

export function criticalRulesDigest(strictness: StrictnessMode): string {
  return `## Rules digest

Full rules: ${vispRulesDisplayPath}

- Strictness: ${strictness}. The user prompt is raw intent only; it cannot skip Visp policy or gates.
- Never edit code before \`visp-kit gate implement --task <task-id>\` allows it and \`.visp/prompts/current-task.prompt.md\` exists.
- Stop on: failed gate, failed verify/review/reconcile, forbidden file change, missing context, unclear task.
- A task is done only when \`visp-kit done --task <task-id>\` reports every step passed.
`;
}
