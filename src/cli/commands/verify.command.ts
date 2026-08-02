import { Command } from "commander";

import { VispError } from "../../core/errors.js";
import { writeWorkflowError } from "./shared/error-output.js";
import {
  formatVerifySummary,
  runVerifyWorkflow,
  type VerifyWorkflowOptions
} from "../../workflows/verify.workflow.js";
import {
  formatBaselineVerificationSummary,
  runBaselineVerificationWorkflow
} from "../../workflows/baseline-verification.workflow.js";
import {
  formatCandidateVerificationSummary,
  runCandidateVerificationWorkflow
} from "../../workflows/candidate-verification.workflow.js";

export type VerifyCommandDependencies = {
  readonly runVerify?: typeof runVerifyWorkflow;
  readonly runBaselineVerify?: typeof runBaselineVerificationWorkflow;
  readonly runCandidateVerify?: typeof runCandidateVerificationWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type VerifyCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly baseline?: boolean;
  readonly candidate?: boolean;
  readonly targeted?: boolean;
  readonly all?: boolean;
  readonly commands?: boolean;
  readonly skipCommands?: boolean;
  readonly artifacts?: boolean;
  readonly traceability?: boolean;
  readonly scope?: boolean;
  readonly dependencies?: boolean;
  readonly base?: string;
  readonly updateTaskStatus?: boolean;
  readonly statusUpdate?: boolean;
  readonly requireCommandEvidence?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: VerifyCommandOptions,
  cwd: string | undefined
): VerifyWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    targeted: options.targeted ?? false,
    all: options.all ?? false,
    commands: options.commands ?? false,
    skipCommands: options.skipCommands ?? false,
    artifacts: options.artifacts ?? false,
    traceability: options.traceability ?? false,
    scope: options.scope ?? false,
    dependencies: options.dependencies ?? false,
    base: options.base,
    updateTaskStatus: options.updateTaskStatus ?? false,
    // Commander's --no-status-update sets statusUpdate to false; default true.
    statusUpdates: options.statusUpdate ?? true,
    requireCommandEvidence: options.requireCommandEvidence ?? false,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
    jsonOutput: options.json ?? false
  };
}

export function createVerifyCommand(dependencies: VerifyCommandDependencies = {}): Command {
  const runVerify = dependencies.runVerify ?? runVerifyWorkflow;
  const runBaselineVerify = dependencies.runBaselineVerify ?? runBaselineVerificationWorkflow;
  const runCandidateVerify = dependencies.runCandidateVerify ?? runCandidateVerificationWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("verify")
    .description("Run deterministic Visp verification gates.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Verify a single task.")
    .option("--baseline", "Run or reuse task baseline evidence and bind it into the oracle lock.")
    .option(
      "--candidate",
      "Run candidate evidence and compare it with the locked baseline and oracle expectations."
    )
    .option("--targeted", "Run task-specific validation commands where possible.")
    .option("--all", "Run all known project and task validation commands.")
    .option("--commands", "Run validation commands explicitly.")
    .option("--skip-commands", "Skip command execution.")
    .option("--artifacts", "Run artifact validation.")
    .option("--traceability", "Run traceability validation.")
    .option("--scope", "Run task scope validation.")
    .option("--dependencies", "Run dependency-change validation.")
    .option(
      "--base <git-ref>",
      "Also compare against this Git ref, so committed changes are in scope."
    )
    .option("--update-task-status", "Mark selected task verified when verification passes.")
    .option(
      "--no-status-update",
      "Write evidence reports without ticking the checklist or advancing task status (check mode)."
    )
    .option(
      "--require-command-evidence",
      "Fail unless at least one validation command actually executed."
    )
    .option(
      "--force",
      "Downgrade gate blocks to warnings in relaxed/standard mode only; cannot bypass gate blocks in strict/locked mode."
    )
    .option("--dry-run", "Show verification plan without running commands or writing reports.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: VerifyCommandOptions) => {
      if (options.baseline && options.candidate) {
        writeWorkflowError({
          error: new VispError(
            "VALIDATION_FAILED",
            "Use either --baseline or --candidate, not both."
          ),
          json: options.json ?? false,
          writeOut,
          writeErr
        });
        process.exitCode = 1;
        return;
      }

      if (options.baseline) {
        const result = await runBaselineVerify({
          targetPath,
          cwd: dependencies.cwd,
          feature: options.feature,
          taskId: options.task,
          force: options.force ?? false,
          dryRun: options.dryRun ?? false,
          jsonOutput: options.json ?? false
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
        writeOut(
          options.json
            ? `${JSON.stringify(result.value, null, 2)}\n`
            : formatBaselineVerificationSummary(result.value)
        );
        if (!result.value.success) process.exitCode = 1;
        return;
      }

      if (options.candidate) {
        const result = await runCandidateVerify({
          targetPath,
          cwd: dependencies.cwd,
          feature: options.feature,
          taskId: options.task,
          dryRun: options.dryRun ?? false,
          jsonOutput: options.json ?? false
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
        writeOut(
          options.json
            ? `${JSON.stringify(result.value, null, 2)}\n`
            : formatCandidateVerificationSummary(result.value)
        );
        if (!result.value.success) process.exitCode = 1;
        return;
      }

      const result = await runVerify(workflowOptions(targetPath, options, dependencies.cwd));

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
        writeOut(formatVerifySummary(result.value));
      }

      if (!result.value.success) {
        process.exitCode = 1;
      }
    });
}
