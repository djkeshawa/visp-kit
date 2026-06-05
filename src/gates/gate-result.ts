import {
  type GateBlockedCommand,
  type GateResult,
  type GateRuleFinding,
  type GateSeverity,
  type GateStage
} from "../artifacts/schemas/gate.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { type GateRuleId } from "./gate-rules.js";

export type GateCheck = {
  readonly ruleId: GateRuleId;
  readonly passed: boolean;
  readonly severity?: GateSeverity;
  readonly message: string;
  readonly recommendation: string;
  readonly evidence: string;
};

export type GateEvaluation = {
  readonly checks: readonly GateCheck[];
  readonly warnings: readonly string[];
  readonly nextAllowedCommand: string;
};

function commandForStage(stage: GateStage): string {
  if (stage === "implement") return "implementation";
  if (stage === "next") return "workflow progression";
  return `visp ${stage}`;
}

function finding(input: GateCheck, strictness: StrictnessMode): GateRuleFinding {
  const severity = strictness === "locked" && input.severity === "warning"
    ? "error"
    : input.severity ?? "error";

  return {
    ruleId: input.ruleId,
    severity,
    message: input.message,
    recommendation: input.recommendation,
    evidence: input.evidence
  };
}

function blockedCommand(
  stage: GateStage,
  rule: GateRuleFinding
): GateBlockedCommand {
  return {
    command: commandForStage(stage),
    reason: rule.message,
    ruleId: rule.ruleId
  };
}

export function buildGateResult(input: {
  readonly targetPath: string;
  readonly stage: GateStage;
  readonly strictnessMode: StrictnessMode;
  readonly dryRun: boolean;
  readonly state: ProjectState;
  readonly evaluation: GateEvaluation;
  readonly reportPath: string;
  readonly evaluatedAt: string;
}): GateResult {
  const failedRules = input.evaluation.checks
    .filter((check) => !check.passed)
    .map((check) => finding(check, input.strictnessMode));
  const blockingRules = failedRules.filter((rule) => rule.severity === "error");
  const warnings = [
    ...new Set([
      ...input.state.warnings,
      ...input.evaluation.warnings,
      ...failedRules
        .filter((rule) => rule.severity !== "error")
        .map((rule) => `${rule.ruleId}: ${rule.message}`)
    ])
  ];
  const allowed = blockingRules.length === 0;

  return {
    success: allowed,
    targetPath: input.targetPath,
    stage: input.stage,
    strictnessMode: input.strictnessMode,
    allowed,
    dryRun: input.dryRun,
    feature: input.state.selectedFeature === undefined
      ? null
      : {
          id: input.state.selectedFeature.id,
          slug: input.state.selectedFeature.slug
        },
    taskId: input.state.selectedTask?.id ?? null,
    passedRules: input.evaluation.checks
      .filter((check) => check.passed)
      .map((check) => check.ruleId),
    failedRules,
    warnings,
    blockedCommands: blockingRules.map((rule) => blockedCommand(input.stage, rule)),
    overriddenRules: [],
    appliedOverrides: [],
    nextAllowedCommand: input.evaluation.nextAllowedCommand,
    reportPath: input.reportPath,
    evaluatedAt: input.evaluatedAt
  };
}
