import { Command } from "commander";

import { formatError } from "../../theme/terminal.js";
import {
  formatDriftSummary,
  runDriftWorkflow,
  type DriftWorkflowOptions
} from "../../workflows/drift.workflow.js";

export type DriftCommandDependencies = {
  readonly runDrift?: typeof runDriftWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type DriftCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly strict?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: DriftCommandOptions,
  cwd: string | undefined
): DriftWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    strict: options.strict ?? false,
    dryRun: options.dryRun ?? false,
    json: options.json ?? false
  };
}

export function createDriftCommand(dependencies: DriftCommandDependencies = {}): Command {
  const runDrift = dependencies.runDrift ?? runDriftWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("drift")
    .description("Detect spec, task, context, and code drift deterministically.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Check drift for a single task's context pack.")
    .option("--strict", "Exit non-zero on drift errors regardless of policy strictness.")
    .option("--dry-run", "Detect drift without writing report files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: DriftCommandOptions) => {
      const result = await runDrift(workflowOptions(targetPath, options, dependencies.cwd));

      if (!result.ok) {
        if (options.json) {
          writeOut(`${JSON.stringify({ success: false, error: result.error.message }, null, 2)}\n`);
        } else {
          writeErr(`${formatError(result.error.message)}\n`);
        }

        process.exitCode = 1;
        return;
      }

      if (options.json) {
        writeOut(`${JSON.stringify(result.value, null, 2)}\n`);
      } else {
        writeOut(formatDriftSummary(result.value));
      }

      const enforcing =
        options.strict === true ||
        result.value.strictnessMode === "strict" ||
        result.value.strictnessMode === "locked";

      if (result.value.result === "failed" && enforcing) process.exitCode = 1;
    });
}
