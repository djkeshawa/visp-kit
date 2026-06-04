import { Command, Option } from "commander";

import {
  agentTargetNameSchema,
  type AgentTargetName
} from "../../artifacts/schemas/agent.schema.js";
import {
  strictnessModeSchema,
  type StrictnessMode
} from "../../artifacts/schemas/policy.schema.js";
import { formatError } from "../../theme/terminal.js";
import {
  formatAgentDoctor,
  formatAgentInstall,
  formatAgentList,
  formatAgentRefresh,
  runAgentDoctorWorkflow,
  runAgentInstallWorkflow,
  runAgentListWorkflow,
  runAgentRefreshWorkflow,
  type AgentDoctorWorkflowOptions,
  type AgentInstallWorkflowOptions,
  type AgentRefreshWorkflowOptions
} from "../../workflows/agent.workflow.js";

export type AgentCommandDependencies = {
  readonly runAgentList?: typeof runAgentListWorkflow;
  readonly runAgentInstall?: typeof runAgentInstallWorkflow;
  readonly runAgentDoctor?: typeof runAgentDoctorWorkflow;
  readonly runAgentRefresh?: typeof runAgentRefreshWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type JsonOption = {
  readonly json?: boolean;
};

type AgentInstallOptions = JsonOption & {
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly strictness?: StrictnessMode;
};

type AgentDoctorOptions = JsonOption & {
  readonly target?: AgentTargetName;
  readonly fix?: boolean;
  readonly dryRun?: boolean;
};

type AgentRefreshOptions = JsonOption & {
  readonly target?: AgentTargetName | "all";
  readonly force?: boolean;
  readonly dryRun?: boolean;
};

function parseTarget(value: string): AgentTargetName | undefined {
  const parsed = agentTargetNameSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function writeError(input: {
  readonly message: string;
  readonly json?: boolean;
  readonly writeOut: (value: string) => void;
  readonly writeErr: (value: string) => void;
}): void {
  if (input.json) {
    input.writeOut(`${JSON.stringify({ success: false, error: input.message }, null, 2)}\n`);
  } else {
    input.writeErr(`${formatError(input.message)}\n`);
  }

  process.exitCode = 1;
}

function installOptions(
  targetPath: string | undefined,
  target: AgentTargetName,
  options: AgentInstallOptions,
  cwd: string | undefined
): AgentInstallWorkflowOptions {
  return {
    targetPath,
    cwd,
    target,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
    strictness: options.strictness
  };
}

function doctorOptions(
  targetPath: string | undefined,
  options: AgentDoctorOptions,
  cwd: string | undefined
): AgentDoctorWorkflowOptions {
  return {
    targetPath,
    cwd,
    target: options.target,
    fix: options.fix ?? false,
    dryRun: options.dryRun ?? false
  };
}

function refreshOptions(
  targetPath: string | undefined,
  options: AgentRefreshOptions,
  cwd: string | undefined
): AgentRefreshWorkflowOptions {
  return {
    targetPath,
    cwd,
    target: options.target,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false
  };
}

export function createAgentCommand(
  dependencies: AgentCommandDependencies = {}
): Command {
  const runList = dependencies.runAgentList ?? runAgentListWorkflow;
  const runInstall = dependencies.runAgentInstall ?? runAgentInstallWorkflow;
  const runDoctor = dependencies.runAgentDoctor ?? runAgentDoctorWorkflow;
  const runRefresh = dependencies.runAgentRefresh ?? runAgentRefreshWorkflow;
  const writeOut =
    dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr =
    dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  const agent = new Command("agent")
    .description("Install and inspect Visp agent-native workflow files.");

  agent
    .command("list")
    .description("List supported Visp agent targets.")
    .argument("[path]", "Target project path.")
    .option("--json", "Print a machine-readable summary.")
    .action((_: string | undefined, options: JsonOption) => {
      const result = runList();

      if (!result.ok) {
        writeError({
          message: result.error.message,
          json: options.json,
          writeOut,
          writeErr
        });
        return;
      }

      writeOut(options.json
        ? `${JSON.stringify(result.value, null, 2)}\n`
        : formatAgentList(result.value));
    });

  agent
    .command("install")
    .description("Install agent-native workflow files.")
    .argument("<target>", "Target: codex or generic.")
    .argument("[path]", "Target project path.")
    .option("--force", "Overwrite existing generated files.")
    .option("--dry-run", "Show what would be created without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .addOption(
      new Option("--strictness <mode>", "Policy strictness mode for generated guidance.")
        .choices(strictnessModeSchema.options)
    )
    .action(
      async (
        targetValue: string,
        targetPath: string | undefined,
        options: AgentInstallOptions
      ) => {
        const target = parseTarget(targetValue);

        if (target === undefined) {
          writeError({
            message: "Agent target must be codex or generic.",
            json: options.json,
            writeOut,
            writeErr
          });
          return;
        }

        const result = await runInstall(
          installOptions(targetPath, target, options, dependencies.cwd)
        );

        if (!result.ok) {
          writeError({
            message: result.error.message,
            json: options.json,
            writeOut,
            writeErr
          });
          return;
        }

        writeOut(options.json
          ? `${JSON.stringify(result.value, null, 2)}\n`
          : formatAgentInstall(result.value));
      }
    );

  agent
    .command("doctor")
    .description("Diagnose installed Visp agent workflow files.")
    .argument("[path]", "Target project path.")
    .addOption(
      new Option("--target <target>", "Target to inspect.")
        .choices(agentTargetNameSchema.options)
    )
    .option("--fix", "Create missing generated files when safe.")
    .option("--dry-run", "Show fixes without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: AgentDoctorOptions) => {
      const result = await runDoctor(doctorOptions(targetPath, options, dependencies.cwd));

      if (!result.ok) {
        writeError({
          message: result.error.message,
          json: options.json,
          writeOut,
          writeErr
        });
        return;
      }

      writeOut(options.json
        ? `${JSON.stringify(result.value, null, 2)}\n`
        : formatAgentDoctor(result.value));

      if (!result.value.success) process.exitCode = 1;
    });

  agent
    .command("refresh")
    .description("Refresh installed Visp agent workflow files.")
    .argument("[path]", "Target project path.")
    .addOption(
      new Option("--target <target>", "Target to refresh.")
        .choices(["codex", "generic", "all"])
    )
    .option("--force", "Overwrite generated files.")
    .option("--dry-run", "Show what would be refreshed without writing files.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: AgentRefreshOptions) => {
      const result = await runRefresh(refreshOptions(targetPath, options, dependencies.cwd));

      if (!result.ok) {
        writeError({
          message: result.error.message,
          json: options.json,
          writeOut,
          writeErr
        });
        return;
      }

      const value = {
        success: true,
        targetPath: result.value[0]?.targetPath ?? targetPath,
        results: result.value
      };

      writeOut(options.json
        ? `${JSON.stringify(value, null, 2)}\n`
        : formatAgentRefresh(result.value));
    });

  return agent;
}
