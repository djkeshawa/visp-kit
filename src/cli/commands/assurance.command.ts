import { Command } from "commander";

import {
  formatAssuranceSummary,
  runAssuranceWorkflow,
  type AssuranceWorkflowOptions
} from "../../workflows/assurance.workflow.js";
import {
  evaluateCurrentReviewDecision,
  runReviewDecisionRepair,
  runReviewDecisionWorkflow,
  type ReviewDecisionWorkflowOptions
} from "../../review/review-decision.js";
import { formatAssuranceDelta } from "../../assurance/assurance-delta-format.js";
import { writeWorkflowError } from "./shared/error-output.js";
import { formatHeader } from "../../theme/terminal.js";

export type AssuranceCommandDependencies = {
  readonly runAssurance?: typeof runAssuranceWorkflow;
  readonly runAssuranceDecision?: typeof runReviewDecisionWorkflow;
  readonly runAssuranceRepair?: typeof runReviewDecisionRepair;
  readonly evaluateCurrentness?: typeof evaluateCurrentReviewDecision;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type AssuranceCommandOptions = {
  readonly feature?: string;
  readonly task: string;
  readonly target?: string;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

type ReviewDecisionCommandOptions = {
  readonly feature?: string;
  readonly task: string;
  readonly reviewer: string;
  readonly signKey?: string;
  readonly reason: string;
  readonly reviewedHotspot?: string[];
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function workflowOptions(
  targetPath: string | undefined,
  options: AssuranceCommandOptions,
  cwd: string | undefined
): AssuranceWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    targetRevision: options.target,
    dryRun: options.dryRun ?? false
  };
}

export function createAssuranceCommand(dependencies: AssuranceCommandDependencies = {}): Command {
  const runAssurance = dependencies.runAssurance ?? runAssuranceWorkflow;
  const runDecision = dependencies.runAssuranceDecision ?? runReviewDecisionWorkflow;
  const runRepair = dependencies.runAssuranceRepair ?? runReviewDecisionRepair;
  const evaluateCurrentness = dependencies.evaluateCurrentness ?? evaluateCurrentReviewDecision;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));
  const command = new Command("assurance").description(
    "Generate deterministic task assurance artifacts."
  );
  command
    .command("generate")
    .argument("[path]", "Target project path.")
    .requiredOption("--task <task-id>", "Task to assure.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--target <git-ref>", "Compare the locked base to a committed target.")
    .option("--dry-run", "Validate and report artifacts without writing them.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: AssuranceCommandOptions) => {
      const result = await runAssurance(workflowOptions(targetPath, options, dependencies.cwd));
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
          : formatAssuranceSummary(result.value)
      );
    });
  command
    .command("delta")
    .description("Show what changed since the last accepted review.")
    .argument("[path]", "Target project path.")
    .requiredOption("--task <task-id>", "Task to report on.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: AssuranceCommandOptions) => {
      const result = await evaluateCurrentness({
        targetPath,
        cwd: dependencies.cwd,
        feature: options.feature,
        taskId: options.task
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

      const { delta, status, reason } = result.value;

      // A delta only exists once there is a decision to compare against. Saying
      // so plainly beats printing an empty report that looks like "nothing
      // changed" when the truth is "nothing was ever approved".
      if (delta === undefined) {
        writeOut(
          options.json
            ? `${JSON.stringify({ status, reason, delta: null }, null, 2)}\n`
            : `${[
                formatHeader("Visp assurance delta — nothing to compare."),
                "",
                status === "current"
                  ? "The current review decision still matches this state exactly."
                  : reason,
                "",
                "Next:",
                status === "current"
                  ? "  No action required."
                  : "  Run visp assurance generate, then accept or reject."
              ].join("\n")}\n`
        );
        return;
      }

      writeOut(
        options.json
          ? `${JSON.stringify({ status, delta }, null, 2)}\n`
          : formatAssuranceDelta(delta)
      );

      // A stale decision is a finding, not a failure of the command, so this
      // exits zero. Scripts should branch on decisionStale rather than on the
      // exit code.
    });

  for (const decision of ["accept", "reject"] as const) {
    command
      .command(decision)
      .description(`${decision === "accept" ? "Accept" : "Reject"} the current assurance case.`)
      .argument("[path]", "Target project path.")
      .requiredOption("--task <task-id>", "Task to review.")
      .requiredOption("--reviewer <reviewer-id>", "Self-declared accountable reviewer.")
      .requiredOption("--reason <reason>", "Meaningful review rationale.")
      .option(
        "--sign-key <path>",
        "SSH private key that signs the decision hash. Without it the reviewer is only self-declared."
      )
      .option("--feature <feature>", "Feature ID, slug, or folder name.")
      .option(
        "--reviewed-hotspot <hotspot-id>",
        "Acknowledge a hotspot. Repeat for multiple hotspots.",
        collect,
        []
      )
      .option("--dry-run", "Validate without writing decision artifacts.")
      .option("--json", "Print a machine-readable summary.")
      .action(async (targetPath: string | undefined, options: ReviewDecisionCommandOptions) => {
        const workflowOptions: ReviewDecisionWorkflowOptions = {
          targetPath,
          cwd: dependencies.cwd,
          feature: options.feature,
          taskId: options.task,
          reviewerId: options.reviewer,
          signKeyPath: options.signKey,
          reason: options.reason,
          reviewedHotspotIds: options.reviewedHotspot ?? [],
          decision,
          dryRun: options.dryRun ?? false
        };
        const result = await runDecision(workflowOptions);
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
            : `Review decision ${result.value.decision} recorded for ${result.value.taskId}.\nCase: ${result.value.caseHash}\nSnapshot: ${result.value.snapshotHash}\nState: ${result.value.stateHash}\nDecision: ${result.value.decisionHash}\nHistory: ${result.value.historyPath}\nPointer: ${result.value.pointerPath}\nNext: ${result.value.nextCommand}\n`
        );
      });
  }
  command
    .command("repair")
    .description("Rebuild the current pointer from unique valid review decision history.")
    .argument("[path]", "Target project path.")
    .requiredOption("--task <task-id>", "Task whose review pointer should be repaired.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--dry-run", "Validate without writing the current pointer.")
    .option("--json", "Print a machine-readable summary.")
    .action(
      async (
        targetPath: string | undefined,
        options: {
          task: string;
          feature?: string;
          dryRun?: boolean;
          json?: boolean;
        }
      ) => {
        const result = await runRepair({
          targetPath,
          cwd: dependencies.cwd,
          feature: options.feature,
          taskId: options.task,
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
        writeOut(
          options.json
            ? `${JSON.stringify(result.value, null, 2)}\n`
            : `Review decision pointer repaired for ${result.value.taskId}.\nDecision: ${result.value.decisionHash}\nPointer: ${result.value.pointerPath}\nNext: ${result.value.nextCommand}\n`
        );
      }
    );
  return command;
}
