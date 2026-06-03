import { Command } from "commander";

import { formatError } from "../../theme/terminal.js";
import {
  formatPrSummary,
  runPrWorkflow,
  type PrWorkflowOptions
} from "../../workflows/pr.workflow.js";

export type PrCommandDependencies = {
  readonly runPr?: typeof runPrWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type PrCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly base?: string;
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly title?: string;
  readonly promptOnly?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: PrCommandOptions,
  cwd: string | undefined
): PrWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    base: options.base,
    staged: options.staged ?? false,
    unstaged: options.unstaged ?? false,
    title: options.title,
    promptOnly: options.promptOnly ?? false,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
    json: options.json ?? false
  };
}

export function createPrCommand(
  dependencies: PrCommandDependencies = {}
): Command {
  const runPr = dependencies.runPr ?? runPrWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("pr")
    .description("Generate a deterministic Visp PR summary.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Generate a task-focused PR section.")
    .option("--base <git-ref>", "Summarize changes against a base Git ref.")
    .option("--staged", "Use staged changes only.")
    .option("--unstaged", "Use unstaged changes only.")
    .option("--title <title>", "Override PR title.")
    .option("--prompt-only", "Generate only .visp/prompts/pr.prompt.md.")
    .option("--force", "Accepted for generated output compatibility.")
    .option("--dry-run", "Show what would be generated without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: PrCommandOptions) => {
      const result = await runPr(workflowOptions(targetPath, options, dependencies.cwd));

      if (!result.ok) {
        if (options.json) {
          writeOut(`${JSON.stringify({ success: false, error: result.error.message }, null, 2)}\n`);
        } else {
          writeErr(`${formatError(result.error.message)}\n`);
        }

        process.exitCode = 1;
        return;
      }

      writeOut(options.json ? `${JSON.stringify(result.value, null, 2)}\n` : formatPrSummary(result.value));
      if (!result.value.success) process.exitCode = 1;
    });
}
