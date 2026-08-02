import {
  type GateResult,
  type GateStage,
  type PolicyGateSummary,
  type PolicyStatus
} from "../artifacts/schemas/gate.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type VispError } from "../core/errors.js";
import { ok, type Result } from "../core/result.js";
import { evaluateGate } from "./gate-engine.js";

function policyStatusFromGate(result: GateResult): PolicyStatus {
  const hasPolicyFailure = (message: string): boolean =>
    result.failedRules.some((rule) => rule.ruleId === "VSP018" && rule.message === message);

  if (hasPolicyFailure("Policy validation failed.")) {
    return "invalid";
  }

  if (
    hasPolicyFailure("Policy file is missing.") ||
    result.warnings.some(
      (warning) => warning === "Policy file is missing. Run `visp-kit policy init` to persist it."
    )
  ) {
    return "missing";
  }

  return "valid";
}

export function summarizeGateResult(result: GateResult): PolicyGateSummary {
  return {
    strictnessMode: result.strictnessMode,
    policyAssuranceProfile: result.policyAssuranceProfile ?? null,
    policyStatus: policyStatusFromGate(result),
    stage: result.stage,
    allowed: result.allowed,
    failedRules: result.failedRules,
    blockedCommands: result.blockedCommands,
    overriddenRules: result.overriddenRules,
    appliedOverrides: result.appliedOverrides,
    warnings: result.warnings,
    nextAllowedCommand: result.nextAllowedCommand,
    nextCommand: result.nextCommand,
    evaluatedAt: result.evaluatedAt
  };
}

export async function evaluatePolicyGate(input: {
  readonly targetPath: string;
  readonly stage: GateStage;
  readonly feature?: string;
  readonly taskId?: string;
  readonly now?: string;
}): Promise<Result<PolicyGateSummary, VispError>> {
  const gate = await evaluateGate({
    targetPath: input.targetPath,
    stage: input.stage,
    feature: input.feature,
    taskId: input.taskId,
    dryRun: true,
    now: input.now ?? new Date().toISOString()
  });

  if (!gate.ok) return gate;
  return ok(summarizeGateResult(gate.value));
}

export function gateResultLabel(gate: PolicyGateSummary): "allowed" | "blocked" | "warnings" {
  if (!gate.allowed) return "blocked";
  if (gate.failedRules.length > 0 || gate.warnings.length > 0) return "warnings";
  return "allowed";
}

export function gateBlocksWorkflow(input: {
  readonly gate: PolicyGateSummary;
  readonly force?: boolean;
}): boolean {
  if (input.gate.policyStatus === "invalid") return true;
  if (input.gate.allowed) return false;
  if (
    input.gate.failedRules.some((rule) => rule.severity === "error" && rule.ruleId === "VSP024")
  ) {
    return true;
  }
  // strict and locked block gate failures unconditionally; --force cannot bypass
  // them. Only relaxed/standard modes allow --force to downgrade blocks to warnings.
  if (input.gate.strictnessMode === "locked" || input.gate.strictnessMode === "strict") {
    return true;
  }
  return input.force !== true;
}

export function strictnessBlocksWarnings(mode: StrictnessMode): boolean {
  return mode === "locked";
}

export function gateFailureMessages(gate: PolicyGateSummary): readonly string[] {
  return gate.failedRules.map((rule) => `${rule.ruleId}: ${rule.message}`);
}

export function gateWarningMessages(gate: PolicyGateSummary): readonly string[] {
  return [
    ...gate.warnings,
    ...gate.failedRules
      .filter((rule) => rule.severity !== "error")
      .map((rule) => `${rule.ruleId}: ${rule.message}`)
  ];
}
