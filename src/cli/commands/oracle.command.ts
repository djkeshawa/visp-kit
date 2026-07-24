import { Command } from "commander";

import { type VispError } from "../../core/errors.js";
import { type Result } from "../../core/result.js";
import {
  formatOracleSummary,
  runOraclePlanWorkflow,
  runOracleValidateWorkflow,
  type OracleWorkflowOptions,
  type OracleWorkflowSummary
} from "../../workflows/oracle.workflow.js";
import {
  formatOracleAuthorizationSummary,
  runOracleApproveWorkflow,
  runOracleLockWorkflow,
  runOracleRevokeWorkflow,
  type OracleApproveWorkflowOptions,
  type OracleAuthorizationWorkflowSummary,
  type OracleRevokeWorkflowOptions
} from "../../workflows/oracle-authorization.workflow.js";
import { writeWorkflowError } from "./shared/error-output.js";

export type OracleCommandDependencies = {
  readonly runOraclePlan?: typeof runOraclePlanWorkflow;
  readonly runOracleValidate?: typeof runOracleValidateWorkflow;
  readonly runOracleApprove?: typeof runOracleApproveWorkflow;
  readonly runOracleRevoke?: typeof runOracleRevokeWorkflow;
  readonly runOracleLock?: typeof runOracleLockWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type CommonOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly json?: boolean;
};

type PlanOptions = CommonOptions & {
  readonly preApprovedTest?: readonly string[];
  readonly force?: boolean;
  readonly dryRun?: boolean;
};

type AuthorizationOptions = CommonOptions & {
  readonly dryRun?: boolean;
};

type ApproveOptions = AuthorizationOptions & {
  readonly reviewer?: string;
  readonly reason?: string;
  readonly expires?: string;
  readonly force?: boolean;
};

type RevokeOptions = AuthorizationOptions & {
  readonly reason?: string;
};

function collect(value: string, previous: readonly string[]): readonly string[] {
  return [...previous, value];
}

async function handleAuthorization(
  result: Promise<Result<OracleAuthorizationWorkflowSummary, VispError>>,
  options: CommonOptions,
  writers: {
    readonly writeOut: (value: string) => void;
    readonly writeErr: (value: string) => void;
  }
): Promise<void> {
  const resolved = await result;
  if (!resolved.ok) {
    writeWorkflowError({
      error: resolved.error,
      json: options.json ?? false,
      writeOut: writers.writeOut,
      writeErr: writers.writeErr
    });
    process.exitCode = 1;
    return;
  }
  writers.writeOut(
    options.json
      ? `${JSON.stringify(resolved.value, null, 2)}\n`
      : formatOracleAuthorizationSummary(resolved.value)
  );
}

async function handle(
  result: Promise<Result<OracleWorkflowSummary, VispError>>,
  options: CommonOptions,
  writers: {
    readonly writeOut: (value: string) => void;
    readonly writeErr: (value: string) => void;
  }
): Promise<void> {
  const resolved = await result;
  if (!resolved.ok) {
    writeWorkflowError({
      error: resolved.error,
      json: options.json ?? false,
      writeOut: writers.writeOut,
      writeErr: writers.writeErr
    });
    process.exitCode = 1;
    return;
  }
  writers.writeOut(
    options.json
      ? `${JSON.stringify(resolved.value, null, 2)}\n`
      : formatOracleSummary(resolved.value)
  );
}

function common(
  targetPath: string | undefined,
  options: CommonOptions,
  cwd: string | undefined
): OracleWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task
  };
}

export function createOracleCommand(dependencies: OracleCommandDependencies = {}): Command {
  const runPlan = dependencies.runOraclePlan ?? runOraclePlanWorkflow;
  const runValidate = dependencies.runOracleValidate ?? runOracleValidateWorkflow;
  const runApprove = dependencies.runOracleApprove ?? runOracleApproveWorkflow;
  const runRevoke = dependencies.runOracleRevoke ?? runOracleRevokeWorkflow;
  const runLock = dependencies.runOracleLock ?? runOracleLockWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));
  const writers = { writeOut, writeErr };
  const oracle = new Command("oracle").description("Generate and validate task oracle plans.");

  oracle
    .command("plan")
    .description("Generate the deterministic oracle plan for a task.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Task ID such as T001.")
    .option(
      "--pre-approved-test <path>",
      "Record an explicitly pre-approved test path. Repeat for multiple paths.",
      collect,
      []
    )
    .option("--force", "Overwrite an existing oracle plan.")
    .option("--dry-run", "Validate and preview without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: PlanOptions) => {
      await handle(
        runPlan({
          ...common(targetPath, options, dependencies.cwd),
          preApprovedTests: options.preApprovedTest ?? [],
          force: options.force ?? false,
          dryRun: options.dryRun ?? false
        }),
        options,
        writers
      );
    });

  oracle
    .command("validate")
    .description("Validate an oracle plan against current authoritative inputs.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Task ID such as T001.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: CommonOptions) => {
      await handle(runValidate(common(targetPath, options, dependencies.cwd)), options, writers);
    });

  oracle
    .command("approve")
    .description("Record human approval for a critical task oracle plan.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Task ID such as T001.")
    .option("--reviewer <reviewer-id>", "Accountable human reviewer identity.")
    .option("--reason <reason>", "Review rationale.")
    .option("--expires <timestamp>", "Optional ISO-8601 approval expiry.")
    .option("--force", "Replace an existing approval.")
    .option("--dry-run", "Validate and preview without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: ApproveOptions) => {
      const workflowOptions: OracleApproveWorkflowOptions = {
        ...common(targetPath, options, dependencies.cwd),
        reviewerId: options.reviewer,
        reason: options.reason,
        expiresAt: options.expires,
        force: options.force ?? false,
        dryRun: options.dryRun ?? false
      };
      await handleAuthorization(runApprove(workflowOptions), options, writers);
    });

  oracle
    .command("revoke")
    .description("Revoke an existing critical-task approval.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Task ID such as T001.")
    .option("--reason <reason>", "Revocation rationale.")
    .option("--dry-run", "Validate and preview without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: RevokeOptions) => {
      const workflowOptions: OracleRevokeWorkflowOptions = {
        ...common(targetPath, options, dependencies.cwd),
        reason: options.reason,
        dryRun: options.dryRun ?? false
      };
      await handleAuthorization(runRevoke(workflowOptions), options, writers);
    });

  oracle
    .command("lock")
    .description("Bind the current oracle plan for implementation authorization.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Task ID such as T001.")
    .option("--dry-run", "Validate and preview without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: AuthorizationOptions) => {
      await handleAuthorization(
        runLock({
          ...common(targetPath, options, dependencies.cwd),
          dryRun: options.dryRun ?? false
        }),
        options,
        writers
      );
    });

  return oracle;
}
