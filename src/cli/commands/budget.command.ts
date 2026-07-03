import { Command, Option } from "commander";

import { budgetModeSchema, type BudgetMode } from "../../artifacts/schemas/common.schema.js";
import { formatBudgetSummary } from "../../budget/budget-summary.js";
import { formatError } from "../../theme/terminal.js";
import { runBudgetWorkflow, type BudgetWorkflowOptions } from "../../workflows/budget.workflow.js";

export type BudgetCommandDependencies = {
  readonly runBudget?: typeof runBudgetWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type BudgetCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly budget?: BudgetMode;
  readonly maxTokens?: string;
  readonly writeReport?: boolean;
  readonly dryRun?: boolean;
  readonly recordUsage?: boolean;
  readonly recordUsageUnavailable?: boolean;
  readonly inputTokens?: string;
  readonly outputTokens?: string;
  readonly totalTokens?: string;
  readonly model?: string;
  readonly usageNote?: string;
  readonly json?: boolean;
};

function parseMaxTokens(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function workflowOptions(
  targetPath: string | undefined,
  options: BudgetCommandOptions,
  cwd: string | undefined
): BudgetWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    budget: options.budget,
    maxTokens: parseMaxTokens(options.maxTokens),
    writeReport: options.writeReport ?? false,
    dryRun: options.dryRun ?? false,
    recordUsage: options.recordUsage ?? false,
    recordUsageUnavailable: options.recordUsageUnavailable ?? false,
    inputTokens: parseOptionalNonNegativeInteger(options.inputTokens),
    outputTokens: parseOptionalNonNegativeInteger(options.outputTokens),
    totalTokens: parseOptionalNonNegativeInteger(options.totalTokens),
    model: options.model,
    usageNote: options.usageNote
  };
}

function parseOptionalNonNegativeInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

export function createBudgetCommand(dependencies: BudgetCommandDependencies = {}): Command {
  const runBudget = dependencies.runBudget ?? runBudgetWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("budget")
    .description("Estimate Visp context token budgets.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Estimate a single task.")
    .addOption(
      new Option("--budget <budget>", "Budget mode for the estimate.").choices(
        budgetModeSchema.options
      )
    )
    .option("--max-tokens <number>", "Override the budget mode max input tokens.")
    .option("--write-report", "Write .visp/reports/budget-report.md.")
    .option("--record-usage", "Record actual agent-reported token usage for --task.")
    .option(
      "--record-usage-unavailable",
      "Record that actual token usage is unavailable for --task."
    )
    .option("--input-tokens <number>", "Actual input tokens used.")
    .option("--output-tokens <number>", "Actual output tokens used.")
    .option("--total-tokens <number>", "Actual total tokens used, if known.")
    .option("--model <name>", "Model or agent surface that reported token usage.")
    .option("--usage-note <text>", "Optional note for recorded token usage.")
    .option("--dry-run", "Calculate without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: BudgetCommandOptions) => {
      const maxTokens = parseMaxTokens(options.maxTokens);
      const numericUsage = [
        ["--input-tokens", parseOptionalNonNegativeInteger(options.inputTokens)],
        ["--output-tokens", parseOptionalNonNegativeInteger(options.outputTokens)],
        ["--total-tokens", parseOptionalNonNegativeInteger(options.totalTokens)]
      ] as const;

      if (Number.isNaN(maxTokens)) {
        const message = "--max-tokens must be a positive integer.";

        if (options.json) {
          writeOut(`${JSON.stringify({ success: false, error: message }, null, 2)}\n`);
        } else {
          writeErr(`${formatError(message)}\n`);
        }

        process.exitCode = 1;
        return;
      }

      const invalidUsage = numericUsage.find(([, value]) => Number.isNaN(value));

      if (invalidUsage !== undefined) {
        const message = `${invalidUsage[0]} must be a non-negative integer.`;

        if (options.json) {
          writeOut(`${JSON.stringify({ success: false, error: message }, null, 2)}\n`);
        } else {
          writeErr(`${formatError(message)}\n`);
        }

        process.exitCode = 1;
        return;
      }

      const result = await runBudget(workflowOptions(targetPath, options, dependencies.cwd));

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
        return;
      }

      writeOut(formatBudgetSummary(result.value));
    });
}
