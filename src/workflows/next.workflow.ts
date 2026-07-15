import { type CommandRunner } from "../core/command-runner.js";
import { type VispError } from "../core/errors.js";
import { ok, type Result } from "../core/result.js";
import { loadProjectState } from "../orchestrator/project-state.js";
import { recommendNextStep, type NextStep } from "../orchestrator/next-step.js";
import { evaluatePolicyGate } from "../gates/policy-gate-summary.js";
import { formatHeader } from "../theme/terminal.js";
import { buildWorkflowActionV2, workflowActionV2Schema } from "../integration/workflow-action.js";

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

  const fallback = recommendNextStep({
    state: state.value,
    taskId: options.taskId,
    strict: options.strict
  });
  const nextGate = await evaluatePolicyGate({
    targetPath: state.value.targetPath,
    stage: "next",
    feature: options.feature,
    taskId: options.taskId ?? state.value.selectedTask?.id
  });
  const implementationGate =
    state.value.selectedTask === undefined
      ? undefined
      : await evaluatePolicyGate({
          targetPath: state.value.targetPath,
          stage: "implement",
          feature: options.feature,
          taskId: options.taskId ?? state.value.selectedTask.id
        });
  const prGate =
    state.value.selectedFeature === undefined
      ? undefined
      : await evaluatePolicyGate({
          targetPath: state.value.targetPath,
          stage: "pr",
          feature: options.feature,
          taskId: options.taskId ?? state.value.selectedTask?.id
        });

  const gateEvaluationError = !nextGate.ok
    ? nextGate.error
    : implementationGate !== undefined && !implementationGate.ok
      ? implementationGate.error
      : prGate !== undefined && !prGate.ok
        ? prGate.error
        : undefined;

  if (gateEvaluationError !== undefined) {
    const nextCommand = "visp override validate";
    const finding = `Override or gate evaluation is unavailable: ${gateEvaluationError.message}`;
    const summary: NextStep = {
      ...fallback,
      success: false,
      nextCommand,
      reason: "Authoritative policy gates could not be evaluated.",
      blockers: [finding],
      warnings: [],
      confidence: "low",
      nextAllowedCommand: nextCommand,
      allowed: false,
      blockedCommands: [],
      failedRules: [],
      implementationAllowed: false,
      prAllowed: false,
      agentInstruction: `Do not implement code until \`${nextCommand}\` succeeds.`
    };
    const baseAction = await buildWorkflowActionV2({ state: state.value, step: summary });

    return ok({
      ...summary,
      action: workflowActionV2Schema.parse({
        ...baseAction,
        verdict: "inconclusive",
        findings: [finding],
        nextCommand
      })
    });
  }

  if (!nextGate.ok) return nextGate;

  const gateWarnings = [
    ...nextGate.value.warnings,
    ...(implementationGate?.ok === false
      ? [`Implementation gate unavailable: ${implementationGate.error.message}`]
      : []),
    ...(prGate?.ok === false ? [`PR gate unavailable: ${prGate.error.message}`] : [])
  ];
  const blockedCommands = [
    ...nextGate.value.blockedCommands,
    ...(implementationGate?.ok && !implementationGate.value.allowed
      ? implementationGate.value.blockedCommands
      : []),
    ...(prGate?.ok && !prGate.value.allowed ? prGate.value.blockedCommands : [])
  ];
  const failedRules = [
    ...nextGate.value.failedRules,
    ...(implementationGate?.ok && !implementationGate.value.allowed
      ? implementationGate.value.failedRules
      : []),
    ...(prGate?.ok && !prGate.value.allowed ? prGate.value.failedRules : [])
  ];
  const existingPreparationCommands = new Set(["visp scan", "visp constitution"]);
  const nextCommand =
    existingPreparationCommands.has(fallback.nextCommand) &&
    nextGate.value.nextAllowedCommand !== "visp policy init --strictness strict"
      ? fallback.nextCommand
      : nextGate.value.nextAllowedCommand;
  const implementationAllowed = implementationGate?.ok ? implementationGate.value.allowed : false;
  const prAllowed = prGate?.ok ? prGate.value.allowed : false;

  const summary: NextStep = {
    ...fallback,
    success: nextGate.value.allowed && fallback.success,
    nextCommand,
    reason:
      nextCommand === fallback.nextCommand
        ? fallback.reason
        : "Policy gate selected the next allowed command.",
    warnings: [...new Set([...fallback.warnings, ...gateWarnings])],
    blockers: [
      ...fallback.blockers,
      ...failedRules
        .filter((rule) => rule.severity === "error")
        .map((rule) => `${rule.ruleId}: ${rule.message}`)
    ],
    strictnessMode: nextGate.value.strictnessMode,
    nextAllowedCommand: nextCommand,
    allowed: nextGate.value.allowed,
    blockedCommands,
    failedRules,
    implementationAllowed,
    prAllowed,
    agentInstruction: implementationAllowed
      ? "Implementation is allowed only for the selected Visp task and context."
      : `Do not implement code until \`${nextCommand}\` succeeds.`
  };

  return ok({
    ...summary,
    action: await buildWorkflowActionV2({ state: state.value, step: summary })
  });
}

export function formatNextSummary(
  summary: NextStep,
  options: {
    readonly commandOnly?: boolean;
    readonly explain?: boolean;
  } = {}
): string {
  if (options.commandOnly) {
    return `${summary.nextCommand}\n`;
  }

  const lines = [
    formatHeader("Visp next"),
    "",
    ...(summary.strictnessMode === undefined ? [] : [`Strictness: ${summary.strictnessMode}`, ""]),
    "Next:",
    `  ${summary.nextCommand}`
  ];

  if (options.explain) {
    lines.push("", "Reason:", `  ${summary.reason}`);
  }

  if (summary.blockers.length > 0) {
    lines.push("", "Blockers:", ...summary.blockers.map((blocker) => `  ${blocker}`));
  }

  if ((summary.blockedCommands?.length ?? 0) > 0 && options.explain) {
    lines.push(
      "",
      "Blocked:",
      ...(summary.blockedCommands ?? []).map(
        (blocked) => `  ${blocked.command}\n    ${blocked.ruleId}: ${blocked.reason}`
      )
    );
  }

  if (summary.warnings.length > 0 && options.explain) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  if (summary.agentInstruction !== undefined && options.explain) {
    lines.push("", "Agent instruction:", `  ${summary.agentInstruction}`);
  }

  return `${lines.join("\n")}\n`;
}
