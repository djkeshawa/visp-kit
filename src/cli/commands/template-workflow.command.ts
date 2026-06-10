import { Command } from "commander";

import { writeWorkflowError } from "./shared/error-output.js";
import {
  type TemplateWorkflowOptions
} from "../../workflows/shared/template-workflow.js";
import {
  formatTemplateWorkflowSummary,
  type TemplateCommandName,
  type TemplateWorkflowSummary
} from "../../workflows/shared/workflow-summary.js";
import { type Result } from "../../core/result.js";
import { type VispError } from "../../core/errors.js";

export type TemplateCommandDependencies = {
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

export type TemplateCommandOptions = {
  readonly feature?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly validate?: boolean;
  readonly promptOnly?: boolean;
};

export type TemplateWorkflowRunner = (
  options?: TemplateWorkflowOptions
) => Promise<Result<TemplateWorkflowSummary, VispError>>;

function workflowOptions(
  targetPath: string | undefined,
  options: TemplateCommandOptions,
  cwd: string | undefined
): TemplateWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
    validate: options.validate ?? false,
    promptOnly: options.promptOnly ?? false
  };
}

export function createTemplateWorkflowCommand(input: {
  readonly name: TemplateCommandName;
  readonly description: string;
  readonly runWorkflow: TemplateWorkflowRunner;
  readonly dependencies?: TemplateCommandDependencies;
}): Command {
  const dependencies = input.dependencies ?? {};
  const writeOut =
    dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr =
    dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command(input.name)
    .description(input.description)
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--force", "Overwrite generated files for this command.")
    .option("--dry-run", "Show what would be created without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .option(
      "--validate",
      "Validate existing artifacts and apply safe normalization when supported."
    )
    .option("--prompt-only", "Write only the related Codex prompt file.")
    .action(async (targetPath: string | undefined, options: TemplateCommandOptions) => {
      const result = await input.runWorkflow(
        workflowOptions(targetPath, options, dependencies.cwd)
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
        writeOut(formatTemplateWorkflowSummary(result.value));
      }

      if (!result.value.success) {
        process.exitCode = 1;
      }
    });
}
