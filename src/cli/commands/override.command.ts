import { Command, Option } from "commander";

import {
  gateStageSchema,
  type GateStage
} from "../../artifacts/schemas/gate.schema.js";
import {
  overrideScopeSchema,
  type OverrideScope
} from "../../artifacts/schemas/override.schema.js";
import { type VispError } from "../../core/errors.js";
import { type Result } from "../../core/result.js";
import { formatError } from "../../theme/terminal.js";
import {
  formatOverrideSummary,
  runOverrideCreateWorkflow,
  runOverrideListWorkflow,
  runOverrideRevokeWorkflow,
  runOverrideShowWorkflow,
  runOverrideValidateWorkflow,
  type OverrideCreateWorkflowOptions,
  type OverrideListWorkflowOptions,
  type OverrideRevokeWorkflowOptions,
  type OverrideShowWorkflowOptions,
  type OverrideValidateWorkflowOptions,
  type OverrideWorkflowSummary
} from "../../workflows/override.workflow.js";

export type OverrideCommandDependencies = {
  readonly runOverrideCreate?: typeof runOverrideCreateWorkflow;
  readonly runOverrideList?: typeof runOverrideListWorkflow;
  readonly runOverrideShow?: typeof runOverrideShowWorkflow;
  readonly runOverrideRevoke?: typeof runOverrideRevokeWorkflow;
  readonly runOverrideValidate?: typeof runOverrideValidateWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type JsonOption = {
  readonly json?: boolean;
};

type OverrideCreateOptions = JsonOption & {
  readonly reason?: string;
  readonly scope?: OverrideScope;
  readonly feature?: string;
  readonly task?: string;
  readonly stage?: GateStage;
  readonly expires?: string;
  readonly dryRun?: boolean;
};

type OverrideListOptions = JsonOption & {
  readonly active?: boolean;
  readonly revoked?: boolean;
  readonly expired?: boolean;
  readonly rule?: string;
  readonly feature?: string;
  readonly task?: string;
};

type OverrideRevokeOptions = JsonOption & {
  readonly reason?: string;
  readonly dryRun?: boolean;
};

async function handleResult(
  result: Promise<Result<OverrideWorkflowSummary, VispError>>,
  options: JsonOption,
  writers: {
    readonly writeOut: (value: string) => void;
    readonly writeErr: (value: string) => void;
  }
): Promise<void> {
  const resolved = await result;

  if (!resolved.ok) {
    if (options.json) {
      writers.writeOut(
        `${JSON.stringify({ success: false, error: resolved.error.message }, null, 2)}\n`
      );
    } else {
      writers.writeErr(`${formatError(resolved.error.message)}\n`);
    }

    process.exitCode = 1;
    return;
  }

  if (options.json) {
    writers.writeOut(`${JSON.stringify(resolved.value, null, 2)}\n`);
  } else {
    writers.writeOut(formatOverrideSummary(resolved.value));
  }

  if (!resolved.value.success) {
    process.exitCode = 1;
  }
}

function createOptions(
  ruleId: string,
  targetPath: string | undefined,
  options: OverrideCreateOptions,
  cwd: string | undefined
): OverrideCreateWorkflowOptions {
  return {
    targetPath,
    cwd,
    ruleId,
    reason: options.reason,
    scope: options.scope,
    feature: options.feature,
    taskId: options.task,
    stage: options.stage,
    expires: options.expires,
    dryRun: options.dryRun ?? false
  };
}

function listOptions(
  targetPath: string | undefined,
  options: OverrideListOptions,
  cwd: string | undefined
): OverrideListWorkflowOptions {
  return {
    targetPath,
    cwd,
    active: options.active ?? false,
    revoked: options.revoked ?? false,
    expired: options.expired ?? false,
    ruleId: options.rule,
    feature: options.feature,
    taskId: options.task
  };
}

function showOptions(
  overrideId: string,
  targetPath: string | undefined,
  cwd: string | undefined
): OverrideShowWorkflowOptions {
  return {
    targetPath,
    cwd,
    overrideId
  };
}

function revokeOptions(
  overrideId: string,
  targetPath: string | undefined,
  options: OverrideRevokeOptions,
  cwd: string | undefined
): OverrideRevokeWorkflowOptions {
  return {
    targetPath,
    cwd,
    overrideId,
    reason: options.reason,
    dryRun: options.dryRun ?? false
  };
}

function validateOptions(
  targetPath: string | undefined,
  cwd: string | undefined
): OverrideValidateWorkflowOptions {
  return { targetPath, cwd };
}

export function createOverrideCommand(
  dependencies: OverrideCommandDependencies = {}
): Command {
  const runCreate = dependencies.runOverrideCreate ?? runOverrideCreateWorkflow;
  const runList = dependencies.runOverrideList ?? runOverrideListWorkflow;
  const runShow = dependencies.runOverrideShow ?? runOverrideShowWorkflow;
  const runRevoke = dependencies.runOverrideRevoke ?? runOverrideRevokeWorkflow;
  const runValidate = dependencies.runOverrideValidate ?? runOverrideValidateWorkflow;
  const writeOut =
    dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr =
    dependencies.writeErr ?? ((value: string) => process.stderr.write(value));
  const writers = { writeOut, writeErr };

  const override = new Command("override")
    .description("Manage explicit, auditable Visp policy overrides.");

  override
    .command("create")
    .description("Create a recorded policy override.")
    .argument("<rule-id>", "Policy rule ID such as VSP014.")
    .argument("[path]", "Target project path.")
    .option("--reason <text>", "Reason for the override.")
    .addOption(
      new Option("--scope <scope>", "Override scope.")
        .choices(overrideScopeSchema.options)
    )
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Task ID such as T001.")
    .addOption(
      new Option("--stage <stage>", "Gate stage for stage-scoped overrides.")
        .choices(gateStageSchema.options)
    )
    .option("--expires <value>", "Expiration ISO datetime or duration such as 7d.")
    .option("--dry-run", "Validate without writing overrides.json.")
    .option("--json", "Print a machine-readable summary.")
    .action(
      async (
        ruleId: string,
        targetPath: string | undefined,
        options: OverrideCreateOptions
      ) => {
        await handleResult(
          runCreate(createOptions(ruleId, targetPath, options, dependencies.cwd)),
          options,
          writers
        );
      }
    );

  override
    .command("list")
    .description("List recorded policy overrides.")
    .argument("[path]", "Target project path.")
    .option("--active", "Show active overrides.")
    .option("--revoked", "Show revoked overrides.")
    .option("--expired", "Show expired overrides.")
    .option("--rule <rule-id>", "Filter by policy rule ID.")
    .option("--feature <feature>", "Filter by feature ID or slug.")
    .option("--task <task-id>", "Filter by task ID.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: OverrideListOptions) => {
      await handleResult(
        runList(listOptions(targetPath, options, dependencies.cwd)),
        options,
        writers
      );
    });

  override
    .command("show")
    .description("Show one policy override.")
    .argument("<override-id>", "Override ID such as OVR001.")
    .argument("[path]", "Target project path.")
    .option("--json", "Print a machine-readable summary.")
    .action(
      async (
        overrideId: string,
        targetPath: string | undefined,
        options: JsonOption
      ) => {
        await handleResult(
          runShow(showOptions(overrideId, targetPath, dependencies.cwd)),
          options,
          writers
        );
      }
    );

  override
    .command("revoke")
    .description("Revoke a recorded policy override.")
    .argument("<override-id>", "Override ID such as OVR001.")
    .argument("[path]", "Target project path.")
    .option("--reason <text>", "Reason for revocation.")
    .option("--dry-run", "Validate without writing overrides.json.")
    .option("--json", "Print a machine-readable summary.")
    .action(
      async (
        overrideId: string,
        targetPath: string | undefined,
        options: OverrideRevokeOptions
      ) => {
        await handleResult(
          runRevoke(revokeOptions(overrideId, targetPath, options, dependencies.cwd)),
          options,
          writers
        );
      }
    );

  override
    .command("validate")
    .description("Validate .visp/overrides.json.")
    .argument("[path]", "Target project path.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: JsonOption) => {
      await handleResult(
        runValidate(validateOptions(targetPath, dependencies.cwd)),
        options,
        writers
      );
    });

  return override;
}
