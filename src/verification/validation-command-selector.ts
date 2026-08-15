import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type ProjectProfile } from "../artifacts/schemas/project.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import {
  classifyValidationCommand,
  type ValidationCommandClassification
} from "./command-classifier.js";

export type VerificationCommandMode = "targeted" | "all" | "feature";

export type ValidationCommandSelection = {
  readonly commands: readonly string[];
  /**
   * Declared entries that will not be executed, with the reason. They are
   * reported, never run: handing an English sentence to `/bin/sh` produces
   * "not found" and calls it a failing test.
   */
  readonly rejected: readonly ValidationCommandClassification[];
  readonly warnings: readonly string[];
};

/**
 * Drop what cannot run and remember why.
 *
 * The old filter removed empties and the literal "TBD" and passed everything
 * else through to a shell. `"TBD"` was only the placeholder the template
 * happened to write; the moment an author replaced it with the sentence they
 * meant, the entry sailed past this line and was executed.
 */
function clean(commands: readonly string[]): {
  readonly commands: string[];
  readonly rejected: ValidationCommandClassification[];
} {
  const classified = commands
    .map((command) => command.trim())
    .filter((command) => command.length > 0)
    .map(classifyValidationCommand);

  return {
    commands: classified
      .filter((entry) => entry.kind === "executable")
      .map((entry) => entry.command),
    rejected: classified.filter((entry) => entry.kind !== "executable")
  };
}

function unique(commands: readonly string[]): {
  readonly commands: string[];
  readonly rejected: ValidationCommandClassification[];
} {
  const cleaned = clean(commands);
  const seen = new Set<string>();

  return {
    commands: [...new Set(cleaned.commands)],
    rejected: cleaned.rejected.filter((entry) => {
      if (seen.has(entry.command)) return false;
      seen.add(entry.command);
      return true;
    })
  };
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
  let selection: {
    readonly commands: string[];
    readonly rejected: ValidationCommandClassification[];
  };

  if (input.mode === "all") {
    selection = unique([...projectAllCommands(input.project), ...taskCommands, ...contextCommands]);
  } else if (input.task !== undefined) {
    // Each fallback keeps the rejections it found. A task whose only entry was
    // a sentence must not fall through to the project defaults with the
    // sentence forgotten — the entry is still wrong and still needs fixing.
    const fromTask = unique(taskCommands);
    const fromContext = fromTask.commands.length === 0 ? unique(contextCommands) : undefined;
    const fromProject =
      fromTask.commands.length === 0 && (fromContext?.commands.length ?? 0) === 0
        ? unique(projectTargetedCommands(input.project))
        : undefined;

    selection = {
      commands:
        fromTask.commands.length > 0
          ? fromTask.commands
          : (fromContext?.commands.length ?? 0) > 0
            ? (fromContext?.commands ?? [])
            : (fromProject?.commands ?? []),
      rejected: [
        ...fromTask.rejected,
        ...(fromContext?.rejected ?? []),
        ...(fromProject?.rejected ?? [])
      ]
    };
  } else {
    selection = unique(projectTargetedCommands(input.project));
  }

  // Rejections are returned, not warned about. The caller decides their
  // severity, and in verification they are errors: a declared check that
  // cannot run is a check that was never performed.
  if (selection.commands.length === 0) {
    warnings.push(
      "No validation commands found. Run visp-kit scan or add validationCommands to the task graph."
    );
  }

  return { commands: selection.commands, rejected: selection.rejected, warnings };
}
