import { Command } from "commander";

import {
  formatAssuranceSummary,
  runAssuranceWorkflow,
  type AssuranceWorkflowOptions
} from "../../workflows/assurance.workflow.js";
import { writeWorkflowError } from "./shared/error-output.js";

export type AssuranceCommandDependencies = {
  readonly runAssurance?: typeof runAssuranceWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type AssuranceCommandOptions = {
  readonly feature?: string;
  readonly task: string;
  readonly target?: string;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: AssuranceCommandOptions,
  cwd: string | undefined
): AssuranceWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    targetRevision: options.target,
    dryRun: options.dryRun ?? false
  };
}

export function createAssuranceCommand(dependencies: AssuranceCommandDependencies = {}): Command {
  const runAssurance = dependencies.runAssurance ?? runAssuranceWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));
  const command = new Command("assurance").description(
    "Generate deterministic task assurance artifacts."
  );
  command
    .command("generate")
    .argument("[path]", "Target project path.")
    .requiredOption("--task <task-id>", "Task to assure.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--target <git-ref>", "Compare the locked base to a committed target.")
    .option("--dry-run", "Validate and report artifacts without writing them.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: AssuranceCommandOptions) => {
      const result = await runAssurance(workflowOptions(targetPath, options, dependencies.cwd));
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
      writeOut(
        options.json
          ? `${JSON.stringify(result.value, null, 2)}\n`
          : formatAssuranceSummary(result.value)
      );
    });
  return command;
}
