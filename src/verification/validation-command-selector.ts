import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type ProjectProfile } from "../artifacts/schemas/project.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";

export type VerificationCommandMode = "targeted" | "all" | "feature";

export type ValidationCommandSelection = {
  readonly commands: readonly string[];
  readonly warnings: readonly string[];
};

function clean(commands: readonly string[]): string[] {
  return commands
    .map((command) => command.trim())
    .filter((command) => command.length > 0 && command.toUpperCase() !== "TBD");
}

function unique(commands: readonly string[]): string[] {
  return [...new Set(clean(commands))];
}

function projectTargetedCommands(project?: ProjectProfile): readonly string[] {
  return [...(project?.testCommands ?? []), ...(project?.typecheckCommands ?? [])];
}

function projectAllCommands(project?: ProjectProfile): readonly string[] {
  return [
    ...(project?.typecheckCommands ?? []),
    ...(project?.lintCommands ?? []),
    ...(project?.testCommands ?? []),
    ...(project?.buildCommands ?? [])
  ];
}

export function selectValidationCommands(input: {
  readonly mode: VerificationCommandMode;
  readonly task?: Task;
  readonly contextPack?: ContextPack;
  readonly project?: ProjectProfile;
}): ValidationCommandSelection {
  const warnings: string[] = [];
  const taskCommands = input.task?.validationCommands ?? [];
  const contextCommands = input.contextPack?.validationCommands ?? [];
  let commands: readonly string[];

  if (input.mode === "all") {
    commands = unique([...projectAllCommands(input.project), ...taskCommands, ...contextCommands]);
  } else if (input.task !== undefined) {
    commands = unique(taskCommands);

    if (commands.length === 0) {
      commands = unique(contextCommands);
    }

    if (commands.length === 0) {
      commands = unique(projectTargetedCommands(input.project));
    }
  } else {
    commands = unique(projectTargetedCommands(input.project));
  }

  if (commands.length === 0) {
    warnings.push(
      "No validation commands found. Run visp-kit scan or add validationCommands to the task graph."
    );
  }

  return { commands, warnings };
}
