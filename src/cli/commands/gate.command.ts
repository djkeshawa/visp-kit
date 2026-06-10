import { Command, Option } from "commander";

import {
  gateStageSchema,
  type GateStage
} from "../../artifacts/schemas/gate.schema.js";
import {
  strictnessModeSchema,
  type StrictnessMode
} from "../../artifacts/schemas/policy.schema.js";
import { formatError } from "../../theme/terminal.js";
import { writeWorkflowError } from "./shared/error-output.js";
import {
  formatGateResult,
  runGateWorkflow,
  type GateWorkflowOptions
} from "../../workflows/gate.workflow.js";

export type GateCommandDependencies = {
  readonly runGate?: typeof runGateWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type GateCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly strictness?: StrictnessMode;
  readonly explain?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  stage: GateStage,
  targetPath: string | undefined,
  options: GateCommandOptions,
  cwd: string | undefined
): GateWorkflowOptions {
  return {
    stage,
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    strictness: options.strictness,
    explain: options.explain ?? false,
    dryRun: options.dryRun ?? false
  };
}

export function createGateCommand(
  dependencies: GateCommandDependencies = {}
): Command {
  const runGate = dependencies.runGate ?? runGateWorkflow;
  const writeOut =
    dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr =
    dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("gate")
    .description("Evaluate deterministic Visp policy gates.")
    .argument("<stage>", "Gate stage to evaluate.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Task ID such as T001.")
    .addOption(
      new Option("--strictness <mode>", "Runtime strictness override.")
        .choices(strictnessModeSchema.options)
    )
    .option("--explain", "Include detailed gate reasoning.")
    .option("--dry-run", "Evaluate without writing gate reports.")
    .option("--json", "Print a machine-readable summary.")
    .action(
      async (
        stage: string,
        targetPath: string | undefined,
        options: GateCommandOptions
      ) => {
        const parsedStage = gateStageSchema.safeParse(stage);

        if (!parsedStage.success) {
          const message =
            "Stage must be one of: next, setup, feature, clarify, spec, plan, tasks, context, implement, verify, review, reconcile, pr.";

          if (options.json) {
            writeOut(`${JSON.stringify({ success: false, error: message }, null, 2)}\n`);
          } else {
            writeErr(`${formatError(message)}\n`);
          }

          process.exitCode = 1;
          return;
        }

        const result = await runGate(
          workflowOptions(parsedStage.data, targetPath, options, dependencies.cwd)
        );

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
          writeOut(formatGateResult(result.value, { explain: options.explain }));
        }

        if (!result.value.allowed) {
          process.exitCode = 1;
        }
      }
    );
}
