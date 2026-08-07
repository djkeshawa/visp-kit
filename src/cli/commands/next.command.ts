import { Command } from "commander";

import {
  DEFAULT_WORKFLOW_ACTION_PROTOCOL,
  SUPPORTED_WORKFLOW_ACTION_PROTOCOLS,
  type WorkflowActionProtocol,
  isWorkflowActionProtocol
} from "../../integration/workflow-action-schema.js";
import { formatError } from "../../theme/terminal.js";
import {
  formatNextSummary,
  runNextWorkflow,
  type NextWorkflowOptions
} from "../../workflows/next.workflow.js";

export type NextCommandDependencies = {
  readonly runNext?: typeof runNextWorkflow;
  readonly writeOut?: (value: string) => void;
  readonly writeErr?: (value: string) => void;
  readonly cwd?: string;
};

type NextCommandOptions = {
  readonly feature?: string;
  readonly task?: string;
  readonly commandOnly?: boolean;
  readonly explain?: boolean;
  readonly strict?: boolean;
  readonly json?: boolean;
  readonly format?: string;
  readonly protocol?: string;
};

function workflowOptions(
  targetPath: string | undefined,
  options: NextCommandOptions,
  cwd: string | undefined,
  protocol: WorkflowActionProtocol | undefined
): NextWorkflowOptions {
  return {
    targetPath,
    cwd,
    feature: options.feature,
    taskId: options.task,
    commandOnly: options.commandOnly ?? false,
    explain: options.explain ?? false,
    strict: options.strict ?? false,
    json: options.json ?? false,
    protocol
  };
}

export function createNextCommand(dependencies: NextCommandDependencies = {}): Command {
  const runNext = dependencies.runNext ?? runNextWorkflow;
  const writeOut = dependencies.writeOut ?? ((value: string) => process.stdout.write(value));
  const writeErr = dependencies.writeErr ?? ((value: string) => process.stderr.write(value));

  return new Command("next")
    .description("Recommend the next Visp workflow command.")
    .argument("[path]", "Target project path.")
    .option("--feature <feature>", "Feature ID, slug, or folder name.")
    .option("--task <task-id>", "Recommend next step for a task.")
    .option("--command-only", "Print only the recommended command.")
    .option("--explain", "Include reasoning.")
    .option("--strict", "Require all deterministic gates.")
    .option("--json", "Print a machine-readable summary.")
    .option("--format <format>", "Output format: text or json.")
    .option(
      "--protocol <version>",
      `WorkflowAction protocol: ${SUPPORTED_WORKFLOW_ACTION_PROTOCOLS.join(", ")}.`
    )
    .action(async (targetPath: string | undefined, options: NextCommandOptions) => {
      if (options.protocol !== undefined && options.format !== "json") {
        writeErr(`${formatError("--protocol requires --format json.", { color: false })}\n`);
        process.exitCode = 1;
        return;
      }

      let protocol: WorkflowActionProtocol | undefined;
      if (options.protocol !== undefined) {
        if (!isWorkflowActionProtocol(options.protocol)) {
          writeOut(
            `${JSON.stringify(
              {
                success: false,
                error: {
                  code: "UNSUPPORTED_WORKFLOW_ACTION_PROTOCOL",
                  requested: options.protocol,
                  supported: SUPPORTED_WORKFLOW_ACTION_PROTOCOLS,
                  default: DEFAULT_WORKFLOW_ACTION_PROTOCOL
                }
              },
              null,
              2
            )}\n`
          );
          process.exitCode = 1;
          return;
        }
        protocol = options.protocol;
      }

      const result = await runNext(
        workflowOptions(targetPath, options, dependencies.cwd, protocol)
      );

      if (!result.ok) {
        if (options.json) {
          writeOut(`${JSON.stringify({ success: false, error: result.error.message }, null, 2)}\n`);
        } else {
          writeErr(`${formatError(result.error.message)}\n`);
        }

        process.exitCode = 1;
        return;
      }

      if (options.format !== undefined && options.format !== "text" && options.format !== "json") {
        writeErr(`${formatError("--format must be text or json.")}\n`);
        process.exitCode = 1;
        return;
      }

      writeOut(
        options.format === "json"
          ? `${JSON.stringify(result.value.action, null, 2)}\n`
          : options.json
            ? `${JSON.stringify(result.value, null, 2)}\n`
            : formatNextSummary(result.value, {
                commandOnly: options.commandOnly,
                explain: options.explain
              })
      );

      // The exit code follows the surface that was printed. When the caller
      // asked for the WorkflowAction frame, the frame's verdict is the
      // contract — exiting by the summary's `success` instead made this
      // command exit 1 while its own output said verdict=ready, and a
      // coordinator comparing the two channels correctly refused to proceed
      // on the contradiction.
      if (options.format === "json") {
        const verdict = (result.value.action as { verdict?: string } | undefined)?.verdict;
        if (verdict !== undefined ? verdict !== "ready" : !result.value.success) {
          process.exitCode = 1;
        }
        return;
      }
      if (!result.value.success) process.exitCode = 1;
    });
}
