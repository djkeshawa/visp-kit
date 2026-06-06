import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { renderStrictTaskPromptHeader } from "./strict-prompt-header.js";

function list(values: readonly string[], empty = "- No concrete validation commands were provided."): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

function implementationChecklist(taskId: string): string {
  return `## Implementation Checklist

Update this checklist as work progresses. If you cannot update the checklist file directly, include the completed checklist in your final response.

- [ ] Read the context pack and current task prompt.
- [ ] Confirm \`visp gate implement --task ${taskId}\` allows implementation.
- [ ] Implement only ${taskId}.
- [ ] Keep changes inside allowed/expected files or document any scope exception.
- [ ] Update or add tests when behavior changes.
- [ ] Run the listed validation commands or report why they could not run.
- [ ] Record actual token usage with \`visp budget --task ${taskId} --record-usage --input-tokens <n> --output-tokens <n> --write-report\`, or record unavailable usage with \`visp budget --task ${taskId} --record-usage-unavailable --model <agent> --usage-note "<reason>" --write-report\`.
- [ ] Run \`visp verify --task ${taskId}\`.
- [ ] Run \`visp review --task ${taskId}\`.
- [ ] Run \`visp reconcile --task ${taskId} --update-traceability\`.
`;
}

export function renderTaskPrompt(input: {
  readonly contextPath: string;
  readonly checklistPath?: string;
  readonly pack: ContextPack;
}): string {
  const task = input.pack.selectedTask;

  return `${renderStrictTaskPromptHeader({ pack: input.pack })}

# Visp Task Implementation Prompt

You are implementing one Visp Kit task.

Use the context pack:
${input.contextPath}

Implementation checklist:
${input.checklistPath ?? "Update the checklist section below."}

Task:
${task.id} - ${task.title}

Rules:
- Implement only ${task.id}.
- Use only the task-specific context.
- Do not implement other tasks.
- Do not make unrelated refactors.
- Do not introduce dependencies unless ${task.id} explicitly allows it.
- Keep functions small and readable.
- Follow existing project conventions.
- Update or add tests if the task changes behavior.
- Respect allowed and forbidden files.
- Run validation commands after changes.

Required validation:
${list(input.pack.validationCommands)}

${implementationChecklist(task.id)}

After implementation:
- Update the implementation checklist status.
- Summarize changed files.
- List validation results.
- Record actual token usage if available. If the agent surface does not expose numeric usage, run \`visp budget --task ${task.id} --record-usage-unavailable --model <agent> --usage-note "<reason>" --write-report\`.
- Mention any follow-up tasks or blockers.
`;
}

export function renderCurrentTaskPrompt(input: {
  readonly promptPath: string;
  readonly contextPath: string;
  readonly checklistPath?: string;
  readonly pack: ContextPack;
}): string {
  return `${renderTaskPrompt({
    contextPath: input.contextPath,
    checklistPath: input.checklistPath,
    pack: input.pack
  })}

Feature-specific prompt:
${input.promptPath}
`;
}
