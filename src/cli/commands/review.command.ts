import { Command } from "commander";

import { writeWorkflowError } from "./shared/error-output.js";
import {
  formatReviewSummary,
  runReviewWorkflow,
  type ReviewWorkflowOptions
} from "../../workflows/review.workflow.js";

export type ReviewCommandDependencies = {
  readonly runReview?: typeof runReviewWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type ReviewCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly diffOnly?: boolean;
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly base?: string;
  readonly promptOnly?: boolean;
  readonly checklistOnly?: boolean;
  readonly skipVerification?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: ReviewCommandOptions,
  cwd: string | undefined
): ReviewWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    diffOnly: options.diffOnly ?? false,
    staged: options.staged ?? false,
    unstaged: options.unstaged ?? false,
    base: options.base,
    promptOnly: options.promptOnly ?? false,
    checklistOnly: options.checklistOnly ?? false,
    skipVerification: options.skipVerification ?? false,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false
  };
}

export function createReviewCommand(dependencies: ReviewCommandDependencies = {}): Command {
  const runReview = dependencies.runReview ?? runReviewWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("review")
    .description("Run deterministic Visp diff review.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Review a single task.")
    .option("--diff-only", "Focus on changed files and deterministic diff analysis.")
    .option("--staged", "Review staged changes only.")
    .option("--unstaged", "Review unstaged changes only.")
    .option("--base <git-ref>", "Review changes against a base Git ref.")
    .option("--prompt-only", "Generate only review prompt files.")
    .option("--checklist-only", "Generate only the review checklist.")
    .option("--skip-verification", "Skip reading verification reports.")
    .option("--force", "Accepted for generated report overwrite compatibility.")
    .option("--dry-run", "Show what would be reviewed without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: ReviewCommandOptions) => {
      const result = await runReview(workflowOptions(targetPath, options, dependencies.cwd));

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
        writeOut(formatReviewSummary(result.value));
      }

      if (!result.value.success) {
        process.exitCode = 1;
      }
    });
}
