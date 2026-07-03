import { Command } from "commander";

import { writeWorkflowError } from "./shared/error-output.js";
import {
  formatReconcileSummary,
  runReconcileWorkflow,
  type ReconcileWorkflowOptions
} from "../../workflows/reconcile.workflow.js";

export type ReconcileCommandDependencies = {
  readonly runReconcile?: typeof runReconcileWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type ReconcileCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly base?: string;
  readonly updateTraceability?: boolean;
  readonly updateTaskStatus?: boolean;
  readonly promptOnly?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: ReconcileCommandOptions,
  cwd: string | undefined
): ReconcileWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    staged: options.staged ?? false,
    unstaged: options.unstaged ?? false,
    base: options.base,
    updateTraceability: options.updateTraceability ?? false,
    updateTaskStatus: options.updateTaskStatus ?? false,
    promptOnly: options.promptOnly ?? false,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
    json: options.json ?? false
  };
}

export function createReconcileCommand(dependencies: ReconcileCommandDependencies = {}): Command {
  const runReconcile = dependencies.runReconcile ?? runReconcileWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("reconcile")
    .description("Reconcile Visp artifacts, evidence, and Git diff.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Reconcile a single task.")
    .option("--staged", "Reconcile staged changes only.")
    .option("--unstaged", "Reconcile unstaged changes only.")
    .option("--base <git-ref>", "Reconcile changes against a base Git ref.")
    .option(
      "--update-traceability",
      "Update traceability artifacts when reconciliation has no blocking errors."
    )
    .option("--update-task-status", "Update selected task status when reconciliation passes.")
    .option("--prompt-only", "Generate only reconcile prompt files.")
    .option("--force", "Allow safe status updates when reconciliation has warnings.")
    .option("--dry-run", "Show reconciliation results without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: ReconcileCommandOptions) => {
      const result = await runReconcile(workflowOptions(targetPath, options, dependencies.cwd));

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
        writeOut(formatReconcileSummary(result.value));
      }

      if (!result.value.success) {
        process.exitCode = 1;
      }
    });
}
