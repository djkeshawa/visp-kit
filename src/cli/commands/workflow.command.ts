import { Command } from "commander";

import { formatError } from "../../theme/terminal.js";
import {
  formatWorkflowCommandSummary,
  runWorkflowShowWorkflow,
  runWorkflowValidateWorkflow,
  type WorkflowCommandOptions
} from "../../workflows/workflow.workflow.js";

export type WorkflowCliDependencies = {
  readonly runWorkflowShow?: typeof runWorkflowShowWorkflow;
  readonly runWorkflowValidate?: typeof runWorkflowValidateWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type JsonOption = {
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: JsonOption,
  cwd: string | undefined
): WorkflowCommandOptions {
  return {
    targetPath,
    cwd,
    json: options.json ?? false
  };
}

export function createWorkflowCommand(dependencies: WorkflowCliDependencies = {}): Command {
  const runShow = dependencies.runWorkflowShow ?? runWorkflowShowWorkflow;
  const runValidate = dependencies.runWorkflowValidate ?? runWorkflowValidateWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  async function handle(
    resultPromise: ReturnType<typeof runWorkflowShowWorkflow>,
    options: JsonOption
  ): Promise<void> {
    const result = await resultPromise;

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
      writeOut(formatWorkflowCommandSummary(result.value));
    }

    if (!result.value.success) process.exitCode = 1;
  }

  const workflow = new Command("workflow").description("Inspect the Visp workflow manifest.");

  workflow
    .command("show")
    .description("Show the effective workflow manifest.")
    .argument("[path]", "Target project path.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: JsonOption) => {
      await handle(runShow(workflowOptions(targetPath, options, dependencies.cwd)), options);
    });

  workflow
    .command("validate")
    .description("Validate the effective workflow manifest.")
    .argument("[path]", "Target project path.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: JsonOption) => {
      await handle(runValidate(workflowOptions(targetPath, options, dependencies.cwd)), options);
    });

  return workflow;
}
