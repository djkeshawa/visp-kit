import { Command } from "commander";

import { formatError } from "../../theme/terminal.js";
import {
  formatDoctorSummary,
  runDoctorWorkflow,
  type DoctorWorkflowOptions
} from "../../workflows/doctor.workflow.js";

export type DoctorCommandDependencies = {
  readonly runDoctor?: typeof runDoctorWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type DoctorCommandOptions = {
  readonly check?: DoctorWorkflowOptions["check"];
  readonly fix?: boolean;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: DoctorCommandOptions,
  cwd: string | undefined
): DoctorWorkflowOptions {
  return {
    targetPath,
    cwd,
    check: options.check ?? "all",
    fix: options.fix ?? false,
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    json: options.json ?? false
  };
}

export function createDoctorCommand(
  dependencies: DoctorCommandDependencies = {}
): Command {
  const runDoctor = dependencies.runDoctor ?? runDoctorWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("doctor")
    .description("Diagnose Visp project health.")
    .argument("[path]", "Target project path.")
    .option("--check <check>", "Check to run: all, project, artifacts, agent, git, cache, schemas.", "all")
    .option("--fix", "Apply safe fixes.")
    .option("--dry-run", "Show fixes without writing files.")
    .option("--verbose", "Include more diagnostic detail.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: DoctorCommandOptions) => {
      const result = await runDoctor(workflowOptions(targetPath, options, dependencies.cwd));

      if (!result.ok) {
        if (options.json) {
          writeOut(`${JSON.stringify({ success: false, error: result.error.message }, null, 2)}\n`);
        } else {
          writeErr(`${formatError(result.error.message)}\n`);
        }

        process.exitCode = 1;
        return;
      }

      writeOut(options.json ? `${JSON.stringify(result.value, null, 2)}\n` : formatDoctorSummary(result.value));
      if (!result.value.success) process.exitCode = 1;
    });
}
