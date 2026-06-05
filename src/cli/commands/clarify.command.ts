import { Command } from "commander";

import { runClarifyWorkflow } from "../../workflows/clarify.workflow.js";
import {
  formatClarifyAnswerSummary,
  runClarifyAnswerWorkflow
} from "../../workflows/clarify-answer.workflow.js";
import { formatError } from "../../theme/terminal.js";
import {
  createTemplateWorkflowCommand,
  type TemplateCommandDependencies
} from "./template-workflow.command.js";

export type ClarifyCommandDependencies = TemplateCommandDependencies & {
  readonly runClarify?: typeof runClarifyWorkflow;
  readonly runClarifyAnswer?: typeof runClarifyAnswerWorkflow;
};

type ClarifyAnswerOptions = {
  readonly feature?: string;
  readonly answer?: string;
  readonly acceptDefault?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function jsonRequested(options: ClarifyAnswerOptions, parentCommand: Command): boolean {
  return Boolean(options.json ?? parentCommand.opts<{ readonly json?: boolean }>().json);
}

export function createClarifyCommand(
  dependencies: ClarifyCommandDependencies = {}
): Command {
  const writeOut =
    dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr =
    dependencies.writeErr ?? ((value: string) => process.stderr.write(value));
  const runAnswer = dependencies.runClarifyAnswer ?? runClarifyAnswerWorkflow;
  const command = createTemplateWorkflowCommand({
    name: "clarify",
    description: "Generate or validate clarification templates for a feature.",
    runWorkflow: dependencies.runClarify ?? runClarifyWorkflow,
    dependencies
  });

  command
    .command("answer")
    .description("Record an answer for a clarification question.")
    .argument("<question-id>", "Clarification question ID, for example CQ001.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--answer <text>", "Answer text to record.")
    .option("--accept-default", "Accept the recommended default answer.")
    .option("--dry-run", "Show what would be updated without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (
      questionId: string,
      targetPath: string | undefined,
      options: ClarifyAnswerOptions
    ) => {
      const json = jsonRequested(options, command);
      const result = await runAnswer({
        targetPath,
        cwd: dependencies.cwd,
        feature: options.feature,
        questionId,
        answer: options.answer,
        acceptDefault: options.acceptDefault ?? false,
        dryRun: options.dryRun ?? false
      });

      if (!result.ok) {
        if (json) {
          writeOut(`${JSON.stringify({ success: false, error: result.error.message }, null, 2)}\n`);
        } else {
          writeErr(`${formatError(result.error.message)}\n`);
        }

        process.exitCode = 1;
        return;
      }

      writeOut(json
        ? `${JSON.stringify(result.value, null, 2)}\n`
        : formatClarifyAnswerSummary(result.value));

      if (!result.value.success) process.exitCode = 1;
    });

  return command;
}
