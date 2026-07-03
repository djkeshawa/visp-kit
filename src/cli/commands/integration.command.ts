import { Command } from "commander";

import { formatError } from "../../theme/terminal.js";
import {
  formatIntegrationContractSummary,
  runIntegrationContractWorkflow,
  type IntegrationContractOptions
} from "../../workflows/integration.workflow.js";

export type IntegrationCommandDependencies = {
  readonly runIntegrationContract?: typeof runIntegrationContractWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type ContractOptions = {
  readonly json?: boolean;
};

function contractOptions(
  targetPath: string | undefined,
  cwd: string | undefined
): IntegrationContractOptions {
  return { targetPath, cwd };
}

export function createIntegrationCommand(
  dependencies: IntegrationCommandDependencies = {}
): Command {
  const runContract = dependencies.runIntegrationContract ?? runIntegrationContractWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  const integration = new Command("integration").description(
    "Print machine-readable integration contracts for orchestrators."
  );

  integration
    .command("contract")
    .description("Print the Visp Kit integration contract.")
    .argument("[path]", "Target project path.")
    .option("--json", "Print a machine-readable summary.")
    .action(async (targetPath: string | undefined, options: ContractOptions) => {
      const result = await runContract(contractOptions(targetPath, dependencies.cwd));

      if (!result.ok) {
        if (options.json) {
          writeOut(`${JSON.stringify({ success: false, error: result.error.message }, null, 2)}\n`);
        } else {
          writeErr(`${formatError(result.error.message)}\n`);
        }
        process.exitCode = 1;
        return;
      }

      writeOut(
        options.json
          ? `${JSON.stringify(result.value, null, 2)}\n`
          : formatIntegrationContractSummary(result.value)
      );
    });

  return integration;
}
