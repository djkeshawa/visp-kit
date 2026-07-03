import { Command } from "commander";

import { writeWorkflowError } from "./shared/error-output.js";
import {
  formatVerifySummary,
  runVerifyWorkflow,
  type VerifyWorkflowOptions
} from "../../workflows/verify.workflow.js";

export type VerifyCommandDependencies = {
  readonly runVerify?: typeof runVerifyWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type VerifyCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly targeted?: boolean;
  readonly all?: boolean;
  readonly commands?: boolean;
  readonly skipCommands?: boolean;
  readonly artifacts?: boolean;
  readonly traceability?: boolean;
  readonly scope?: boolean;
  readonly dependencies?: boolean;
  readonly updateTaskStatus?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: VerifyCommandOptions,
  cwd: string | undefined
): VerifyWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    targeted: options.targeted ?? false,
    all: options.all ?? false,
    commands: options.commands ?? false,
    skipCommands: options.skipCommands ?? false,
    artifacts: options.artifacts ?? false,
    traceability: options.traceability ?? false,
    scope: options.scope ?? false,
    dependencies: options.dependencies ?? false,
    updateTaskStatus: options.updateTaskStatus ?? false,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
    jsonOutput: options.json ?? false
  };
}

export function createVerifyCommand(dependencies: VerifyCommandDependencies = {}): Command {
  const runVerify = dependencies.runVerify ?? runVerifyWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("verify")
    .description("Run deterministic Visp verification gates.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Verify a single task.")
    .option("--targeted", "Run task-specific validation commands where possible.")
    .option("--all", "Run all known project and task validation commands.")
    .option("--commands", "Run validation commands explicitly.")
    .option("--skip-commands", "Skip command execution.")
    .option("--artifacts", "Run artifact validation.")
    .option("--traceability", "Run traceability validation.")
    .option("--scope", "Run task scope validation.")
    .option("--dependencies", "Run dependency-change validation.")
    .option("--update-task-status", "Mark selected task verified when verification passes.")
    .option("--force", "Accepted for generated report overwrite compatibility.")
    .option("--dry-run", "Show verification plan without running commands or writing reports.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: VerifyCommandOptions) => {
      const result = await runVerify(workflowOptions(targetPath, options, dependencies.cwd));

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
        writeOut(formatVerifySummary(result.value));
      }

      if (!result.value.success) {
        process.exitCode = 1;
      }
    });
}
