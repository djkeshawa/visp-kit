import { Command, Option } from "commander";

import {
  budgetModeSchema,
  riskLevelSchema,
  type BudgetMode,
  type RiskLevel
} from "../../artifacts/schemas/common.schema.js";
import { formatError } from "../../theme/terminal.js";
import {
  runFeatureWorkflow,
  type FeatureWorkflowOptions
} from "../../workflows/feature.workflow.js";
import { formatFeatureSummary } from "../../features/feature-summary.js";

export type FeatureCommandDependencies = {
  readonly runFeature?: typeof runFeatureWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type FeatureCommandOptions = {
  readonly budget?: BudgetMode;
  readonly risk?: RiskLevel;
  readonly branch?: boolean;
  readonly branchName?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

type RawCommand = Command & {
  readonly rawArgs?: readonly string[];
  readonly parent: (Command & { readonly rawArgs?: readonly string[] }) | null;
};

function rawArgs(command: Command): readonly string[] {
  const rawCommand = command as RawCommand;
  return (rawCommand.parent?.rawArgs ?? rawCommand.rawArgs ?? []).slice();
}

function hasRawFlag(args: readonly string[], flag: string): boolean {
  return args.includes(flag);
}

function workflowOptions(
  featureIdea: string,
  targetPath: string | undefined,
  options: FeatureCommandOptions,
  command: Command,
  cwd: string | undefined
): FeatureWorkflowOptions {
  const args = rawArgs(command);
  const noBranch = hasRawFlag(args, "--no-branch");

  return {
    featureIdea,
    targetPath,
    cwd,
    budget: options.budget,
    risk: options.risk,
    branch: hasRawFlag(args, "--branch") || options.branch === true,
    noBranch,
    branchName: options.branchName,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false
  };
}

function branchConflict(command: Command): boolean {
  const args = rawArgs(command);
  return hasRawFlag(args, "--branch") && hasRawFlag(args, "--no-branch");
}

export function createFeatureCommand(dependencies: FeatureCommandDependencies = {}): Command {
  const runFeature = dependencies.runFeature ?? runFeatureWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("feature")
    .description("Create a Visp feature intent workspace.")
    .argument("<feature idea>", "Feature idea or title.")
    .argument("[path]", "Target project path.")
    .addOption(
      new Option("--budget <budget>", "Budget mode for this feature.").choices(
        budgetModeSchema.options
      )
    )
    .addOption(
      new Option("--risk <risk>", "Risk level for this feature.").choices(riskLevelSchema.options)
    )
    .option("--branch", "Create a Git branch for the feature.")
    .option("--no-branch", "Do not create a Git branch.")
    .option("--branch-name <name>", "Git branch name to create.")
    .option("--force", "Overwrite generated intent files when safe.")
    .option("--dry-run", "Show what would be created without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(
      async (
        featureIdea: string,
        targetPath: string | undefined,
        options: FeatureCommandOptions,
        command: Command
      ) => {
        if (branchConflict(command)) {
          const message = "Use either --branch or --no-branch, not both.";

          if (options.json) {
            writeOut(`${JSON.stringify({ success: false, error: message }, null, 2)}\n`);
          } else {
            writeErr(`${formatError(message)}\n`);
          }

          process.exitCode = 1;
          return;
        }

        const result = await runFeature(
          workflowOptions(featureIdea, targetPath, options, command, dependencies.cwd)
        );

        if (!result.ok) {
          if (options.json) {
            writeOut(
              `${JSON.stringify({ success: false, error: result.error.message }, null, 2)}\n`
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

        writeOut(formatFeatureSummary(result.value));
      }
    );
}
