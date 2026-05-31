import { Command } from "commander";

import { formatError } from "../../theme/terminal.js";
import {
  runScanWorkflow,
  type ScanWorkflowOptions
} from "../../workflows/scan.workflow.js";
import { formatScanSummary } from "../../workflows/scan/scan-summary.js";

export type ScanCommandDependencies = {
  readonly runScan?: typeof runScanWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type ScanCommandOptions = {
  readonly changed?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

function workflowOptions(
  targetPath: string | undefined,
  options: ScanCommandOptions,
  cwd: string | undefined
): ScanWorkflowOptions {
  return {
    targetPath,
    cwd,
    changed: options.changed ?? false,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false
  };
}

export function createScanCommand(
  dependencies: ScanCommandDependencies = {}
): Command {
  const runScan = dependencies.runScan ?? runScanWorkflow;
  const writeOut =
    dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr =
    dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("scan")
    .description("Scan a project and update the Visp project index.")
    .argument("[path]", "Target project path.")
    .option("--changed", "Reuse unchanged summaries based on file hashes.")
    .option("--force", "Rebuild summaries even when file hashes are unchanged.")
    .option("--dry-run", "Show what would be scanned and written.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: ScanCommandOptions) => {
      const result = await runScan(
        workflowOptions(targetPath, options, dependencies.cwd)
      );

      if (!result.ok) {
        if (options.json) {
          writeOut(
            `${JSON.stringify(
              { success: false, error: result.error.message },
              null,
              2
            )}\n`
          );
        } else {
          writeErr(`${formatError(result.error.message)}\n`);
        }

        process.exitCode = 1;
        return;
      }

      if (options.json) {
        writeOut(`${JSON.stringify(result.value, null, 2)}\n`);
        return;
      }

      writeOut(formatScanSummary(result.value));
    });
}
