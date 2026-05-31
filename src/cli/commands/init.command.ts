import { Command, Option } from "commander";

import {
  agentModeSchema,
  budgetModeSchema,
  presetSchema,
  type AgentMode,
  type BudgetMode,
  type Preset
} from "../../artifacts/schemas/common.schema.js";
import { formatError } from "../../theme/terminal.js";
import {
  runInitWorkflow,
  type InitWorkflowOptions
} from "../../workflows/init.workflow.js";
import { formatInitSummary } from "../../workflows/init/init-summary.js";

export type InitCommandDependencies = {
  readonly runWorkflow?: typeof runInitWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type InitCommandOptions = {
  readonly agent: AgentMode;
  readonly budget: BudgetMode;
  readonly preset: Preset;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: InitCommandOptions,
  cwd: string | undefined
): InitWorkflowOptions {
  return {
    targetPath,
    cwd,
    agent: options.agent,
    budget: options.budget,
    preset: options.preset,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false
  };
}

export function createInitCommand(
  dependencies: InitCommandDependencies = {}
): Command {
  const runWorkflow = dependencies.runWorkflow ?? runInitWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("init")
    .description("Initialize Visp Kit in a project.")
    .argument("[path]", "Target project path.")
    .addOption(
      new Option("--agent <agent>", "Agent integration to generate.")
        .choices(agentModeSchema.options)
        .default("generic")
    )
    .addOption(
      new Option("--budget <budget>", "Budget mode to save.")
        .choices(budgetModeSchema.options)
        .default("lean")
    )
    .addOption(
      new Option("--preset <preset>", "Project preset to save.")
        .choices(presetSchema.options)
        .default("generic")
    )
    .option("--force", "Overwrite existing generated files.")
    .option("--dry-run", "Show what would be created without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: InitCommandOptions) => {
      const result = await runWorkflow(
        workflowOptions(targetPath, options, dependencies.cwd)
      );

      if (!result.ok) {
        if (options.json) {
          writeOut(
            `${JSON.stringify(
              { success: false, error: result.error.message },
              null,
              2
            )}\n`
          );
        } else {
          writeErr(`${formatError(result.error.message)}\n`);
        }

        process.exitCode = 1;
        return;
      }

      if (options.json) {
        writeOut(`${JSON.stringify(result.value, null, 2)}\n`);
        return;
      }

      writeOut(formatInitSummary(result.value));
    });
}
