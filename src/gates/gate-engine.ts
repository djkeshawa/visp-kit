import { gateReportArtifactPath } from "../artifacts/artifact-paths.js";
import {
  type AppliedPolicyOverride,
  type GateResult,
  type GateStage
} from "../artifacts/schemas/gate.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { VispError, toVispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { buildGateResult } from "./gate-result.js";
import { loadGateContext, type GateContext } from "./gate-context.js";
import { findApplicableOverride } from "../overrides/override-matcher.js";
import { readOverrideStore } from "../overrides/override-store.js";
import {
  evaluateClarifyGate,
  evaluateContextGate,
  evaluateFeatureGate,
  evaluateImplementGate,
  evaluateNextGate,
  evaluatePlanGate,
  evaluatePrGate,
  evaluateReconcileGate,
  evaluateReviewGate,
  evaluateSetupGate,
  evaluateSpecGate,
  evaluateTasksGate,
  evaluateVerifyGate
} from "./stage-checks.js";

export type GateEngineOptions = {
  readonly targetPath: string;
  readonly stage: GateStage;
  readonly feature?: string;
  readonly taskId?: string;
  readonly strictness?: StrictnessMode;
  readonly dryRun: boolean;
  readonly now: string;
};

function evaluateStage(context: GateContext, stage: GateStage) {
  switch (stage) {
    case "next":
      return evaluateNextGate(context);
    case "setup":
      return evaluateSetupGate(context);
    case "feature":
      return evaluateFeatureGate(context);
    case "clarify":
      return evaluateClarifyGate(context);
    case "spec":
      return evaluateSpecGate(context);
    case "plan":
      return evaluatePlanGate(context);
    case "tasks":
      return evaluateTasksGate(context);
    case "context":
      return evaluateContextGate(context);
    case "implement":
      return evaluateImplementGate(context);
    case "verify":
      return evaluateVerifyGate(context);
    case "review":
      return evaluateReviewGate(context);
    case "reconcile":
      return evaluateReconcileGate(context);
    case "pr":
      return evaluatePrGate(context);
  }
}

async function applyPolicyOverrides(input: {
  readonly result: GateResult;
  readonly context: GateContext;
  readonly stage: GateStage;
  readonly now: string;
}): Promise<Result<GateResult, VispError>> {
  if (!input.context.state.initialized) return ok(input.result);

  const store = await readOverrideStore(input.context.state.targetPath);

  if (!store.ok) return store;
  if (!store.value.exists || store.value.artifact.overrides.length === 0) {
    return ok(input.result);
  }

  const applied: AppliedPolicyOverride[] = [];
  const overriddenRules = new Set<string>();
  const failedRules = input.result.failedRules.map((rule) => {
    const override = findApplicableOverride({
      rule,
      stage: input.stage,
      state: input.context.state,
      policy: input.context.policy.policy,
      overrides: store.value.artifact,
      now: input.now
    });

    if (override === undefined) return rule;

    const key = `${override.overrideId}:${override.ruleId}:${override.appliedToStage}`;

    if (
      !applied.some((item) => `${item.overrideId}:${item.ruleId}:${item.appliedToStage}` === key)
    ) {
      applied.push(override);
    }

    overriddenRules.add(rule.ruleId);

    return {
      ...rule,
      severity: "warning" as const,
      message: `${rule.message} Rule was overridden by ${override.overrideId}.`
    };
  });

  if (applied.length === 0) return ok(input.result);

  const blockingRules = failedRules.filter((rule) => rule.severity === "error");
  const allowed = blockingRules.length === 0;
  const warnings = [
    ...new Set([
      ...input.result.warnings,
      ...applied.map(
        (override) =>
          `${override.ruleId}: Rule was overridden by ${override.overrideId}. Reason: ${override.reason}`
      )
    ])
  ];

  return ok({
    ...input.result,
    success: allowed,
    allowed,
    failedRules,
    warnings,
    blockedCommands: input.result.blockedCommands.filter(
      (command) => !overriddenRules.has(command.ruleId)
    ),
    overriddenRules: [...overriddenRules].sort(),
    appliedOverrides: applied
  });
}

export async function evaluateGate(
  options: GateEngineOptions
): Promise<Result<GateResult, VispError>> {
  try {
    const loaded = await loadGateContext({
      targetPath: options.targetPath,
      feature: options.feature,
      taskId: options.taskId,
      strictness: options.strictness,
      now: options.now
    });

    if (!loaded.ok) return loaded;

    const context = loaded.value;

    if (!context.state.initialized && options.stage !== "setup" && options.stage !== "next") {
      return err(
        new VispError("VALIDATION_FAILED", "Visp Kit is not initialized. Run `visp init` first.", {
          recovery: "visp init"
        })
      );
    }

    const evaluation = evaluateStage(context, options.stage);

    const baseResult = buildGateResult({
      targetPath: options.targetPath,
      stage: options.stage,
      strictnessMode: context.policy.policy.strictnessMode,
      dryRun: options.dryRun,
      state: context.state,
      evaluation,
      reportPath: relativePath(options.targetPath, gateReportArtifactPath(options.targetPath)),
      evaluatedAt: options.now
    });

    return applyPolicyOverrides({
      result: baseResult,
      context,
      stage: options.stage,
      now: options.now
    });
  } catch (error) {
    return err(toVispError(error, "VALIDATION_FAILED"));
  }
}
