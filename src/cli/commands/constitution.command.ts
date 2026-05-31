import { Command, Option } from "commander";

import {
  budgetModeSchema,
  presetSchema,
  type BudgetMode,
  type Preset
} from "../../artifacts/schemas/common.schema.js";
import { formatError } from "../../theme/terminal.js";
import {
  runConstitutionWorkflow,
  type ConstitutionWorkflowOptions
} from "../../workflows/constitution.workflow.js";
import { formatConstitutionSummary } from "../../constitution/constitution-summary.js";

export type ConstitutionCommandDependencies = {
  readonly runConstitution?: typeof runConstitutionWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type ConstitutionCommandOptions = {
  readonly preset?: Preset;
  readonly budget?: BudgetMode;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly validate?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: ConstitutionCommandOptions,
  cwd: string | undefined
): ConstitutionWorkflowOptions {
  return {
    targetPath,
    cwd,
    preset: options.preset,
    budget: options.budget,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
    validate: options.validate ?? false
  };
}

export function createConstitutionCommand(
  dependencies: ConstitutionCommandDependencies = {}
): Command {
  const runConstitution =
    dependencies.runConstitution ?? runConstitutionWorkflow;
  const writeOut =
    dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr =
    dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("constitution")
    .description("Generate or validate the Visp project constitution.")
    .argument("[path]", "Target project path.")
    .addOption(
      new Option("--preset <preset>", "Constitution preset.")
        .choices(presetSchema.options)
    )
    .addOption(
      new Option("--budget <budget>", "Budget mode.")
        .choices(budgetModeSchema.options)
    )
    .option("--force", "Overwrite existing constitution files.")
    .option("--dry-run", "Show what would be generated without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .option("--validate", "Validate the existing compact constitution.")
    .action(
      async (
        targetPath: string | undefined,
        options: ConstitutionCommandOptions
      ) => {
        const result = await runConstitution(
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
        } else {
          writeOut(formatConstitutionSummary(result.value));
        }

        if (!result.value.success) {
          process.exitCode = 1;
        }
      }
    );
}
