import { Command, Option } from "commander";

import {
  strictnessModeSchema,
  type StrictnessMode
} from "../../artifacts/schemas/policy.schema.js";
import { formatError } from "../../theme/terminal.js";
import {
  formatPolicySummary,
  runPolicyInitWorkflow,
  runPolicySetStrictnessWorkflow,
  runPolicyShowWorkflow,
  runPolicyValidateWorkflow,
  type PolicyInitOptions,
  type PolicySetStrictnessOptions,
  type PolicyShowOptions,
  type PolicyValidateOptions,
  type PolicyWorkflowSummary
} from "../../workflows/policy.workflow.js";
import { type Result } from "../../core/result.js";
import { type VispError } from "../../core/errors.js";

export type PolicyCommandDependencies = {
  readonly runPolicyInit?: typeof runPolicyInitWorkflow;
  readonly runPolicyShow?: typeof runPolicyShowWorkflow;
  readonly runPolicyValidate?: typeof runPolicyValidateWorkflow;
  readonly runPolicySetStrictness?: typeof runPolicySetStrictnessWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type JsonOption = {
  readonly json?: boolean;
};

type PolicyInitCommandOptions = JsonOption & {
  readonly strictness?: StrictnessMode;
  readonly force?: boolean;
  readonly dryRun?: boolean;
};

type PolicySetStrictnessCommandOptions = JsonOption & {
  readonly dryRun?: boolean;
};

async function handleResult(
  result: Promise<Result<PolicyWorkflowSummary, VispError>>,
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
    writers.writeOut(formatPolicySummary(resolved.value));
  }

  if (!resolved.value.success) {
    process.exitCode = 1;
  }
}

function initOptions(
  targetPath: string | undefined,
  options: PolicyInitCommandOptions,
  cwd: string | undefined
): PolicyInitOptions {
  return {
    targetPath,
    cwd,
    strictness: options.strictness,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false
  };
}

function showOptions(targetPath: string | undefined, cwd: string | undefined): PolicyShowOptions {
  return { targetPath, cwd };
}

function validateOptions(
  targetPath: string | undefined,
  cwd: string | undefined
): PolicyValidateOptions {
  return { targetPath, cwd };
}

function setStrictnessOptions(
  mode: StrictnessMode,
  targetPath: string | undefined,
  options: PolicySetStrictnessCommandOptions,
  cwd: string | undefined
): PolicySetStrictnessOptions {
  return {
    targetPath,
    cwd,
    strictness: mode,
    dryRun: options.dryRun ?? false
  };
}

export function createPolicyCommand(dependencies: PolicyCommandDependencies = {}): Command {
  const runInit = dependencies.runPolicyInit ?? runPolicyInitWorkflow;
  const runShow = dependencies.runPolicyShow ?? runPolicyShowWorkflow;
  const runValidate = dependencies.runPolicyValidate ?? runPolicyValidateWorkflow;
  const runSetStrictness = dependencies.runPolicySetStrictness ?? runPolicySetStrictnessWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));
  const writers = { writeOut, writeErr };

  const policy = new Command("policy").description("Manage Visp policy-as-code.");

  policy
    .command("init")
    .description("Create .visp/policy.json.")
    .argument("[path]", "Target project path.")
    .addOption(
      new Option("--strictness <mode>", "Policy strictness mode.").choices(
        strictnessModeSchema.options
      )
    )
    .option("--force", "Overwrite existing policy.json.")
    .option("--dry-run", "Show what would be written without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: PolicyInitCommandOptions) => {
      await handleResult(
        runInit(initOptions(targetPath, options, dependencies.cwd)),
        options,
        writers
      );
    });

  policy
    .command("show")
    .description("Show the effective Visp policy.")
    .argument("[path]", "Target project path.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: JsonOption) => {
      await handleResult(runShow(showOptions(targetPath, dependencies.cwd)), options, writers);
    });

  policy
    .command("validate")
    .description("Validate .visp/policy.json.")
    .argument("[path]", "Target project path.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: JsonOption) => {
      await handleResult(
        runValidate(validateOptions(targetPath, dependencies.cwd)),
        options,
        writers
      );
    });

  policy
    .command("set-strictness")
    .description("Update policy strictness mode.")
    .argument("<mode>", "Strictness mode: relaxed, standard, strict, locked.")
    .argument("[path]", "Target project path.")
    .addOption(new Option("--dry-run", "Show what would be written without writing files."))
    .option("--json", "Print a machine-readable summary.")
    .action(
      async (
        mode: string,
        targetPath: string | undefined,
        options: PolicySetStrictnessCommandOptions
      ) => {
        const parsedMode = strictnessModeSchema.safeParse(mode);

        if (!parsedMode.success) {
          const message = "--strictness mode must be relaxed, standard, strict, or locked.";

          if (options.json) {
            writeOut(`${JSON.stringify({ success: false, error: message }, null, 2)}\n`);
          } else {
            writeErr(`${formatError(message)}\n`);
          }

          process.exitCode = 1;
          return;
        }

        await handleResult(
          runSetStrictness(
            setStrictnessOptions(parsedMode.data, targetPath, options, dependencies.cwd)
          ),
          options,
          writers
        );
      }
    );

  return policy;
}
