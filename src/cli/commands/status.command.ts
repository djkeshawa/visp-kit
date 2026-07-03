import { Command } from "commander";

import { formatError } from "../../theme/terminal.js";
import {
  formatStatusSummary,
  runStatusWorkflow,
  type StatusWorkflowOptions
} from "../../workflows/status.workflow.js";

export type StatusCommandDependencies = {
  readonly runStatus?: typeof runStatusWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type StatusCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly verbose?: boolean;
  readonly writeReport?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: StatusCommandOptions,
  cwd: string | undefined
): StatusWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    verbose: options.verbose ?? false,
    writeReport: options.writeReport ?? false,
    json: options.json ?? false
  };
}

export function createStatusCommand(dependencies: StatusCommandDependencies = {}): Command {
  const runStatus = dependencies.runStatus ?? runStatusWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("status")
    .description("Show the current Visp project state.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Show task-specific status.")
    .option("--verbose", "Include detailed artifact and Git status.")
    .option("--write-report", "Write .visp/reports/status-report.md.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: StatusCommandOptions) => {
      const result = await runStatus(workflowOptions(targetPath, options, dependencies.cwd));

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
          : formatStatusSummary(result.value, { verbose: options.verbose })
      );

      if (!result.value.success) {
        process.exitCode = 1;
      }
    });
}
