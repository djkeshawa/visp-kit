import { Command, Option } from "commander";

import {
  implementationChecklistStatusSchema,
  type ImplementationChecklistStatus
} from "../../artifacts/schemas/implementation-checklist.schema.js";
import { type VispError } from "../../core/errors.js";
import { type Result } from "../../core/result.js";
import { writeWorkflowError } from "./shared/error-output.js";
import {
  formatChecklistSummary,
  runChecklistStatusWorkflow,
  runChecklistUpdateWorkflow,
  type ChecklistStatusWorkflowOptions,
  type ChecklistUpdateWorkflowOptions,
  type ChecklistWorkflowSummary
} from "../../workflows/checklist.workflow.js";

export type ChecklistCommandDependencies = {
  readonly runChecklistStatus?: typeof runChecklistStatusWorkflow;
  readonly runChecklistUpdate?: typeof runChecklistUpdateWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type JsonOption = {
  readonly json?: boolean;
};

type ChecklistStatusOptions = JsonOption & {
  readonly feature?: string;
  readonly task?: string;
};

type ChecklistUpdateOptions = ChecklistStatusOptions & {
  readonly item?: string;
  readonly status?: ImplementationChecklistStatus;
  readonly reason?: string;
  readonly evidence?: string;
  readonly dryRun?: boolean;
};

async function handleResult(
  result: Promise<Result<ChecklistWorkflowSummary, VispError>>,
  options: JsonOption,
  writers: {
    readonly writeOut: (value: string) => void;
    readonly writeErr: (value: string) => void;
  }
): Promise<void> {
  const resolved = await result;

  if (!resolved.ok) {
    writeWorkflowError({
      error: resolved.error,
      json: options.json ?? false,
      writeOut: writers.writeOut,
      writeErr: writers.writeErr
    });
    process.exitCode = 1;
    return;
  }

  if (options.json) {
    writers.writeOut(`${JSON.stringify(resolved.value, null, 2)}\n`);
  } else {
    writers.writeOut(formatChecklistSummary(resolved.value));
  }
}

function statusOptions(
  targetPath: string | undefined,
  options: ChecklistStatusOptions,
  cwd: string | undefined
): ChecklistStatusWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task
  };
}

function updateOptions(
  targetPath: string | undefined,
  options: ChecklistUpdateOptions,
  cwd: string | undefined
): ChecklistUpdateWorkflowOptions {
  return {
    ...statusOptions(targetPath, options, cwd),
    itemId: options.item,
    status: options.status,
    reason: options.reason,
    evidence: options.evidence,
    dryRun: options.dryRun ?? false
  };
}

export function createChecklistCommand(
  dependencies: ChecklistCommandDependencies = {}
): Command {
  const runStatus = dependencies.runChecklistStatus ?? runChecklistStatusWorkflow;
  const runUpdate = dependencies.runChecklistUpdate ?? runChecklistUpdateWorkflow;
  const writeOut =
    dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr =
    dependencies.writeErr ?? ((value: string) => process.stderr.write(value));
  const writers = { writeOut, writeErr };
  const checklist = new Command("checklist")
    .description("Inspect and update implementation checklist artifacts.");

  checklist
    .command("status")
    .description("Show implementation checklist status for a task.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Task ID such as T001.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: ChecklistStatusOptions) => {
      await handleResult(
        runStatus(statusOptions(targetPath, options, dependencies.cwd)),
        options,
        writers
      );
    });

  checklist
    .command("update")
    .description("Update one implementation checklist item.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Task ID such as T001.")
    .option("--item <id>", "Checklist item ID.")
    .addOption(
      new Option("--status <status>", "Checklist item status.")
        .choices(implementationChecklistStatusSchema.options)
    )
    .option("--reason <reason>", "Reason for blocked, not_applicable, or unavailable status.")
    .option("--evidence <text>", "Evidence for the status update.")
    .option("--dry-run", "Validate without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: ChecklistUpdateOptions) => {
      await handleResult(
        runUpdate(updateOptions(targetPath, options, dependencies.cwd)),
        options,
        writers
      );
    });

  return checklist;
}
