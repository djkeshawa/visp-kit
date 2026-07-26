import { gateReportArtifactPath } from "../artifacts/artifact-paths.js";
import {
  type AppliedPolicyOverride,
  type GateResult,
  type GateStage
} from "../artifacts/schemas/gate.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { selectAssuranceProfile } from "../assurance/assurance-profile.js";
import { VispError, toVispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { buildGateResult, type GateEvaluation } from "./gate-result.js";
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
import {
  loadOracleAuthorization,
  oraclePlanExists
} from "../workflows/oracle-authorization.workflow.js";
import { evaluateReviewDecisionRequirement } from "../review/review-decision.js";

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

function assuranceChecks(context: GateContext): GateEvaluation["checks"] {
  const task = context.state.selectedTask;
  const policyProfile = context.policy.policy.assurance?.profile;

  if (
    task === undefined ||
    task.taskClass === undefined ||
    task.riskFactors === undefined ||
    policyProfile === undefined
  ) {
    return [];
  }

  const selection = selectAssuranceProfile({
    taskClass: task.taskClass,
    riskLevel: task.riskLevel,
    riskFactors: task.riskFactors,
    changedPaths: [...task.allowedFiles, ...(task.expectedFiles ?? [])],
    policyProfile
  });
  const loweringRequiresOverride =
    selection.selectedProfile !== policyProfile &&
    selection.reasons.some((reason) => reason.code === "policy_lowering_requires_override");

  return [
    {
      ruleId: "VSP022",
      passed: !loweringRequiresOverride,
      message: loweringRequiresOverride
        ? `Project policy requests ${policyProfile} assurance below the calculated ${selection.calculatedProfile} minimum.`
        : `Project policy does not lower the calculated ${selection.calculatedProfile} assurance minimum.`,
      recommendation:
        "Raise or remove policy.assurance.profile, or record a scoped VSP022 override with a human reason.",
      evidence: `calculated=${selection.calculatedProfile}; policy=${policyProfile}`
    }
  ];
}

async function oracleAuthorizationChecks(input: {
  readonly context: GateContext;
  readonly options: GateEngineOptions;
}): Promise<GateEvaluation["checks"]> {
  if (
    input.options.stage !== "implement" ||
    input.context.state.selectedTask === undefined ||
    input.context.state.selectedFeature === undefined
  ) {
    return [];
  }

  const workflowOptions = {
    targetPath: input.options.targetPath,
    feature: `${input.context.state.selectedFeature.id}-${input.context.state.selectedFeature.slug}`,
    taskId: input.context.state.selectedTask.id,
    now: input.options.now
  };
  const planExists = await oraclePlanExists(workflowOptions);
  const required =
    input.context.policy.policy.rules.requireOracleLockBeforeImplementation === true ||
    input.context.policy.policy.assurance !== undefined ||
    (planExists.ok && planExists.value);

  if (!required) return [];

  const authorization = await loadOracleAuthorization(workflowOptions);
  return [
    authorization.ok
      ? {
          ruleId: "VSP023",
          passed: true,
          message: "Oracle implementation authorization is current.",
          recommendation: "Continue.",
          evidence: `${authorization.value.binding.lockPath} (${authorization.value.binding.lockHash})`
        }
      : {
          ruleId: "VSP023",
          passed: false,
          severity: "error",
          message: "Oracle implementation authorization is missing, stale, or invalid.",
          recommendation: `Run visp oracle plan --task ${input.context.state.selectedTask.id}, then visp oracle lock --task ${input.context.state.selectedTask.id}.`,
          evidence: authorization.error.message
        }
  ];
}

async function reviewDecisionChecks(input: {
  readonly context: GateContext;
  readonly options: GateEngineOptions;
}): Promise<GateEvaluation["checks"]> {
  const task = input.context.state.selectedTask;
  if (input.options.stage !== "pr" || task === undefined) return [];
  const evaluated = await evaluateReviewDecisionRequirement({
    targetPath: input.options.targetPath,
    feature: input.options.feature,
    taskId: task.id,
    enabled: input.context.policy.policy.rules.requireCurrentAssuranceDecisionBeforePr === true,
    now: input.options.now
  });
  if (!evaluated.ok) {
    return [
      {
        ruleId: "VSP024",
        passed: false,
        severity: "error",
        message: "Current assurance decision could not be validated.",
        recommendation: `Run visp assurance generate --task ${task.id}.`,
        evidence: evaluated.error.message
      }
    ];
  }
  const { required, currentness } = evaluated.value;
  const signatureRequired =
    input.context.policy.policy.rules.requireSignedAssuranceDecision === true;
  // Only meaningful once a decision exists; VSP024 already covers its absence.
  const signatureChecks: GateEvaluation["checks"] =
    signatureRequired && currentness.decision !== undefined
      ? [
          {
            ruleId: "VSP025",
            passed: currentness.decision.identityAssurance === "ssh_signed",
            ...(currentness.decision.identityAssurance === "ssh_signed"
              ? {}
              : { severity: "error" as const }),
            message:
              currentness.decision.identityAssurance === "ssh_signed"
                ? "The assurance decision carries a verified signature."
                : "The assurance decision records a self-declared reviewer, not a verified signature.",
            recommendation:
              currentness.decision.identityAssurance === "ssh_signed"
                ? "Continue."
                : `Re-record the decision with visp assurance accept --task ${task.id} --sign-key <path-to-ssh-key>.`,
            evidence:
              currentness.decision.signature === undefined
                ? `identityAssurance=${currentness.decision.identityAssurance}`
                : `key=${currentness.decision.signature.keyFingerprint}`
          }
        ]
      : [];
  const rejected = currentness.status === "rejected";
  const passed = required
    ? currentness.status === "current"
    : currentness.status === "missing" || currentness.status === "current";
  const recommendation =
    currentness.status === "invalid" && /pointer|history/iu.test(currentness.reason)
      ? `Run visp assurance repair --task ${task.id}.`
      : currentness.caseHash === undefined
        ? `Run visp assurance generate --task ${task.id}.`
        : `Run visp assurance accept --task ${task.id} --reviewer <id> --reason "<reason>" --reviewed-hotspot <id>.`;
  return [
    ...signatureChecks,
    {
      ruleId: "VSP024",
      passed,
      ...(passed ? {} : { severity: "error" as const }),
      message: passed
        ? required
          ? "A current assurance acceptance decision is recorded."
          : "Current assurance acceptance is not required by policy."
        : rejected
          ? "The current assurance decision rejects PR readiness."
          : `A required assurance decision is ${currentness.status}.`,
      recommendation: passed ? "Continue." : recommendation,
      evidence:
        currentness.status === "current"
          ? `case=${currentness.caseHash}; decision=${currentness.decisionHash}`
          : currentness.reason
    }
  ];
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

    const stageEvaluation = evaluateStage(context, options.stage);
    const authorizationChecks = await oracleAuthorizationChecks({ context, options });
    const decisionChecks = await reviewDecisionChecks({ context, options });
    const evaluation = {
      ...stageEvaluation,
      checks: [
        ...stageEvaluation.checks,
        ...assuranceChecks(context),
        ...authorizationChecks,
        ...decisionChecks
      ]
    };

    const baseResult = buildGateResult({
      targetPath: options.targetPath,
      stage: options.stage,
      strictnessMode: context.policy.policy.strictnessMode,
      policyAssuranceProfile: context.policy.policy.assurance?.profile,
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
