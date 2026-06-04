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
  if (result.warnings.some((warning) => warning.includes("Policy file is missing"))) {
    return "missing";
  }

  return "valid";
}

export function summarizeGateResult(result: GateResult): PolicyGateSummary {
  return {
    strictnessMode: result.strictnessMode,
    policyStatus: policyStatusFromGate(result),
    stage: result.stage,
    allowed: result.allowed,
    failedRules: result.failedRules,
    blockedCommands: result.blockedCommands,
    warnings: result.warnings,
    nextAllowedCommand: result.nextAllowedCommand,
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
  if (input.gate.allowed) return false;
  if (input.gate.strictnessMode === "locked") return true;
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
