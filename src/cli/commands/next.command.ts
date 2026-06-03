import { Command } from "commander";

import { formatError } from "../../theme/terminal.js";
import {
  formatNextSummary,
  runNextWorkflow,
  type NextWorkflowOptions
} from "../../workflows/next.workflow.js";

export type NextCommandDependencies = {
  readonly runNext?: typeof runNextWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type NextCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly commandOnly?: boolean;
  readonly explain?: boolean;
  readonly strict?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: NextCommandOptions,
  cwd: string | undefined
): NextWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    commandOnly: options.commandOnly ?? false,
    explain: options.explain ?? false,
    strict: options.strict ?? false,
    json: options.json ?? false
  };
}

export function createNextCommand(
  dependencies: NextCommandDependencies = {}
): Command {
  const runNext = dependencies.runNext ?? runNextWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("next")
    .description("Recommend the next Visp workflow command.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Recommend next step for a task.")
    .option("--command-only", "Print only the recommended command.")
    .option("--explain", "Include reasoning.")
    .option("--strict", "Require all deterministic gates.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: NextCommandOptions) => {
      const result = await runNext(workflowOptions(targetPath, options, dependencies.cwd));

      if (!result.ok) {
        if (options.json) {
          writeOut(`${JSON.stringify({ success: false, error: result.error.message }, null, 2)}\n`);
        } else {
          writeErr(`${formatError(result.error.message)}\n`);
        }

        process.exitCode = 1;
        return;
      }

      writeOut(
        options.json
          ? `${JSON.stringify(result.value, null, 2)}\n`
          : formatNextSummary(result.value, {
              commandOnly: options.commandOnly,
              explain: options.explain
            })
      );

      if (!result.value.success) process.exitCode = 1;
    });
}
