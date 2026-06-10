import { Command, Option } from "commander";

import {
  budgetModeSchema,
  type BudgetMode
} from "../../artifacts/schemas/common.schema.js";
import {
  formatContextSummary
} from "../../context/context-summary.js";
import { formatError } from "../../theme/terminal.js";
import { writeWorkflowError } from "./shared/error-output.js";
import {
  runContextWorkflow,
  type ContextWorkflowOptions
} from "../../workflows/context.workflow.js";

export type ContextCommandDependencies = {
  readonly runContext?: typeof runContextWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type ContextCommandOptions = {
  readonly feature?: string;
  readonly next?: boolean;
  readonly budget?: BudgetMode;
  readonly maxTokens?: string;
  readonly includeFullFiles?: boolean;
  readonly promptOnly?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function parseMaxTokens(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function workflowOptions(
  taskId: string | undefined,
  targetPath: string | undefined,
  options: ContextCommandOptions,
  cwd: string | undefined
): ContextWorkflowOptions {
  let resolvedTaskId = taskId;
  let resolvedPath = targetPath;

  if (options.next && targetPath === undefined && taskId !== undefined) {
    resolvedPath = taskId;
    resolvedTaskId = undefined;
  }

  return {
    taskId: resolvedTaskId,
    targetPath: resolvedPath,
    cwd,
    feature: options.feature,
    next: options.next ?? false,
    budget: options.budget,
    maxTokens: parseMaxTokens(options.maxTokens),
    includeFullFiles: options.includeFullFiles ?? false,
    promptOnly: options.promptOnly ?? false,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false
  };
}

export function createContextCommand(
  dependencies: ContextCommandDependencies = {}
): Command {
  const runContext = dependencies.runContext ?? runContextWorkflow;
  const writeOut =
    dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr =
    dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("context")
    .description("Compile a task-specific Visp context pack.")
    .argument("[task-id]", "Task ID such as T001.")
    .argument("[path]", "Target project path.")
    .option("--next", "Select the next ready or unblocked task.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .addOption(
      new Option("--budget <budget>", "Budget mode for this context.")
        .choices(budgetModeSchema.options)
    )
    .option("--max-tokens <number>", "Override the budget mode max input tokens.")
    .option("--include-full-files", "Include full selected files when within budget.")
    .option("--prompt-only", "Generate only task prompt files.")
    .option("--force", "Overwrite generated context files for this task.")
    .option("--dry-run", "Calculate context without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(
      async (
        taskId: string | undefined,
        targetPath: string | undefined,
        options: ContextCommandOptions
      ) => {
        const maxTokens = parseMaxTokens(options.maxTokens);

        if (Number.isNaN(maxTokens)) {
          const message = "--max-tokens must be a positive integer.";

          if (options.json) {
            writeOut(`${JSON.stringify({ success: false, error: message }, null, 2)}\n`);
          } else {
            writeErr(`${formatError(message)}\n`);
          }

          process.exitCode = 1;
          return;
        }

        const result = await runContext(
          workflowOptions(taskId, targetPath, options, dependencies.cwd)
        );

        if (!result.ok) {
          writeWorkflowError({
            error: result.error,
            json: options.json ?? false,
            writeOut,
            writeErr
          });
          process.exitCode = 1;
          return;
        }

        if (options.json) {
          writeOut(`${JSON.stringify(result.value, null, 2)}\n`);
          return;
        }

        writeOut(formatContextSummary(result.value));
      }
    );
}
