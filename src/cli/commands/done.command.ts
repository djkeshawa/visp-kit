import { Command } from "commander";

import { writeWorkflowError } from "./shared/error-output.js";
import {
  formatDoneSummary,
  runDoneWorkflow,
  type DoneWorkflowOptions
} from "../../workflows/done.workflow.js";

export type DoneCommandDependencies = {
  readonly runDone?: typeof runDoneWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type DoneCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly inputTokens?: string;
  readonly outputTokens?: string;
  readonly model?: string;
  readonly usageNote?: string;
  readonly usageUnavailable?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function tokens(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number.parseInt(value, 10);
}

function workflowOptions(
  targetPath: string | undefined,
  options: DoneCommandOptions,
  cwd: string | undefined
): DoneWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    inputTokens: tokens(options.inputTokens),
    outputTokens: tokens(options.outputTokens),
    model: options.model,
    usageNote: options.usageNote,
    usageUnavailable: options.usageUnavailable ?? false,
    dryRun: options.dryRun ?? false
  };
}

export function createDoneCommand(dependencies: DoneCommandDependencies = {}): Command {
  const runDone = dependencies.runDone ?? runDoneWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("done")
    .description(
      "Run the post-implementation pipeline for one task: verify, record usage, review, reconcile, checklist, next."
    )
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Task to finish.")
    .option("--input-tokens <n>", "Actual input tokens used for the task.")
    .option("--output-tokens <n>", "Actual output tokens used for the task.")
    .option("--model <model>", "Model or agent that produced the work.")
    .option("--usage-note <note>", "Note recorded with the usage entry.")
    .option("--usage-unavailable", "Record that the agent surface does not expose token usage.")
    .option("--dry-run", "Run the pipeline without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: DoneCommandOptions) => {
      const result = await runDone(workflowOptions(targetPath, options, dependencies.cwd));

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
      } else {
        writeOut(formatDoneSummary(result.value));
      }

      if (!result.value.success) {
        process.exitCode = 1;
      }
    });
}
