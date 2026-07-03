import { Command } from "commander";

import { formatError } from "../../theme/terminal.js";
import {
  formatEvalSummary,
  runEvalWorkflow,
  type EvalWorkflowOptions
} from "../../workflows/eval.workflow.js";

export type EvalCommandDependencies = {
  readonly runEval?: typeof runEvalWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type EvalCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly strict?: boolean;
  readonly benchmark?: boolean;
  readonly writeReport?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: EvalCommandOptions,
  cwd: string | undefined
): EvalWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    strict: options.strict ?? false,
    benchmark: options.benchmark ?? false,
    writeReport: options.writeReport ?? true,
    dryRun: options.dryRun ?? false,
    json: options.json ?? false
  };
}

export function createEvalCommand(dependencies: EvalCommandDependencies = {}): Command {
  const runEval = dependencies.runEval ?? runEvalWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("eval")
    .description("Evaluate Visp workflow quality deterministically.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Evaluate a single task.")
    .option("--strict", "Treat missing workflow evidence as blocking where practical.")
    .option("--benchmark", "Include deterministic benchmark metrics in the report.")
    .option("--write-report", "Write evaluation report files.", true)
    .option("--dry-run", "Evaluate without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: EvalCommandOptions) => {
      const result = await runEval(workflowOptions(targetPath, options, dependencies.cwd));

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
        writeOut(formatEvalSummary(result.value));
      }

      if (!result.value.success) process.exitCode = 1;
    });
}
