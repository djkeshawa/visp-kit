import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { ok, type Result } from "../core/result.js";
import { loadProjectState } from "../orchestrator/project-state.js";
import {
  recommendNextStep,
  type NextStep
} from "../orchestrator/next-step.js";
import { formatHeader } from "../theme/terminal.js";

export type NextWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly commandOnly?: boolean;
  readonly explain?: boolean;
  readonly strict?: boolean;
  readonly json?: boolean;
  readonly commandRunner?: CommandRunner;
};

export async function runNextWorkflow(
  options: NextWorkflowOptions = {}
): Promise<Result<NextStep, VispError>> {
  const state = await loadProjectState(options);

  if (!state.ok) return state;

  return ok(
    recommendNextStep({
      state: state.value,
      taskId: options.taskId,
      strict: options.strict
    })
  );
}

export function formatNextSummary(summary: NextStep, options: {
  readonly commandOnly?: boolean;
  readonly explain?: boolean;
} = {}): string {
  if (options.commandOnly) {
    return `${summary.nextCommand}\n`;
  }

  const lines = [
    formatHeader("Visp next"),
    "",
    "Next:",
    `  ${summary.nextCommand}`
  ];

  if (options.explain) {
    lines.push(
      "",
      "Reason:",
      `  ${summary.reason}`
    );
  }

  if (summary.blockers.length > 0) {
    lines.push("", "Blockers:", ...summary.blockers.map((blocker) => `  ${blocker}`));
  }

  if (summary.warnings.length > 0 && options.explain) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}
