import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";

function list(values: readonly string[], empty = "- No concrete validation commands were provided."): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

export function renderTaskPrompt(input: {
  readonly contextPath: string;
  readonly pack: ContextPack;
}): string {
  const task = input.pack.selectedTask;

  return `# Visp Task Implementation Prompt

You are implementing one Visp Kit task.

Use the context pack:
${input.contextPath}

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

After implementation:
- Summarize changed files.
- List validation results.
- Mention any follow-up tasks or blockers.
`;
}

export function renderCurrentTaskPrompt(input: {
  readonly promptPath: string;
  readonly contextPath: string;
  readonly pack: ContextPack;
}): string {
  return `${renderTaskPrompt({
    contextPath: input.contextPath,
    pack: input.pack
  })}

Feature-specific prompt:
${input.promptPath}
`;
}
