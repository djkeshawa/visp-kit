import { Command } from "commander";

import { writeWorkflowError } from "./shared/error-output.js";
import {
  formatHooksSummary,
  runHooksWorkflow,
  type HooksKind
} from "../../workflows/hooks.workflow.js";

export type HooksCommandDependencies = {
  readonly runHooks?: typeof runHooksWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type HooksCommandOptions = {
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

export function createHooksCommand(dependencies: HooksCommandDependencies = {}): Command {
  const runHooks = dependencies.runHooks ?? runHooksWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  const hooks = new Command("hooks").description(
    "Install Visp enforcement hooks: Claude Code gate hook, git pre-commit check, CI evidence workflow."
  );

  const subcommands: ReadonlyArray<{ kind: HooksKind; description: string }> = [
    {
      kind: "claude",
      description: "Install the Claude Code PreToolUse gate hook and print the settings snippet."
    },
    {
      kind: "git",
      description: "Install the git pre-commit evidence check."
    },
    {
      kind: "ci",
      description: "Generate a GitHub Actions workflow that checks policy and the PR gate."
    }
  ];

  for (const { kind, description } of subcommands) {
    hooks
      .command(kind)
      .description(description)
      .argument("[path]", "Target project path.")
      .option("--force", "Overwrite existing files.")
      .option("--dry-run", "Show what would be written without writing files.")
      .option("--json", "Print a machine-readable summary.")
      .action(async (targetPath: string | undefined, options: HooksCommandOptions) => {
        const result = await runHooks({
          targetPath,
          cwd: dependencies.cwd,
          kind,
          force: options.force ?? false,
          dryRun: options.dryRun ?? false
        });

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
          writeOut(formatHooksSummary(result.value));
        }

        if (!result.value.success) {
          process.exitCode = 1;
        }
      });
  }

  return hooks;
}
