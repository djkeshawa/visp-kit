import { Command, Option } from "commander";

import { budgetModeSchema, type BudgetMode } from "../../artifacts/schemas/common.schema.js";
import { formatContextSummary } from "../../context/context-summary.js";
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
  readonly snippetCap?: "on" | "off";
  readonly promptOnly?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

/**
 * `on|off` rather than a boolean flag pair, because the absent state has to
 * stay distinguishable from "off": absent defers to `.visp/config.json` and
 * then to the per-mode default, and `--no-snippet-cap` would collapse those
 * into one value at the parser.
 */
function parseSnippetCap(value: "on" | "off" | undefined): boolean | undefined {
  return value === undefined ? undefined : value === "on";
}

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

  const snippetCap = parseSnippetCap(options.snippetCap);

  return {
    taskId: resolvedTaskId,
    targetPath: resolvedPath,
    cwd,
    feature: options.feature,
    next: options.next ?? false,
    budget: options.budget,
    maxTokens: parseMaxTokens(options.maxTokens),
    includeFullFiles: options.includeFullFiles ?? false,
    ...(snippetCap === undefined ? {} : { snippetCap }),
    promptOnly: options.promptOnly ?? false,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false
  };
}

export function createContextCommand(dependencies: ContextCommandDependencies = {}): Command {
  const runContext = dependencies.runContext ?? runContextWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("context")
    .description("Compile a task-specific Visp context pack.")
    .argument("[task-id]", "Task ID such as T001.")
    .argument("[path]", "Target project path.")
    .option("--next", "Select the next ready or unblocked task.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .addOption(
      new Option("--budget <budget>", "Budget mode for this context.").choices(
        budgetModeSchema.options
      )
    )
    .option("--max-tokens <number>", "Override the budget mode max input tokens.")
    .option("--include-full-files", "Include full selected files when within budget.")
    .addOption(
      new Option(
        "--snippet-cap <mode>",
        "Cap snippets at 4 files and 40 lines (on), or give every selected file an uncapped snippet (off). Default on."
      ).choices(["on", "off"])
    )
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
