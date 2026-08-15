import { gateReportArtifactPath } from "../artifacts/artifact-paths.js";
import {
  type AppliedPolicyOverride,
  type ClassificationInvalidated,
  type GateResult,
  type GateStage,
  type TaskClassificationRecord
} from "../artifacts/schemas/gate.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { selectAssuranceProfile } from "../assurance/assurance-profile.js";
import { assuranceActive } from "../oracle/assurance-activation.js";
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
import {
  understandingExportExists,
  understandingGateActive
} from "../understanding/understanding-activation.js";
import { sourceChangedFiles } from "./artifact-presence.js";
import { evaluateUnderstandingGate } from "./understanding-gate.js";
import { type TaskClassification } from "./task-classification.js";
import { type GateCheck } from "./gate-result.js";

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
  const required = assuranceActive({
    policy: input.context.policy.policy,
    oraclePlanExists: planExists.ok && planExists.value
  });

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
          recommendation: `Run visp-kit oracle plan --task ${input.context.state.selectedTask.id}, then visp-kit oracle lock --task ${input.context.state.selectedTask.id}.`,
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
        recommendation: `Run visp-kit assurance generate --task ${task.id}.`,
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
                : `Re-record the decision with visp-kit assurance accept --task ${task.id} --sign-key <path-to-ssh-key>.`,
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
      ? `Run visp-kit assurance repair --task ${task.id}.`
      : currentness.caseHash === undefined
        ? `Run visp-kit assurance generate --task ${task.id}.`
        : `Run visp-kit assurance accept --task ${task.id} --reviewer <id> --reason "<reason>" --reviewed-hotspot <id>.`;
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

type UnderstandingOutcome = {
  readonly checks: readonly GateCheck[];
  readonly warnings: readonly string[];
  readonly classification?: TaskClassificationRecord;
  readonly classificationInvalidated?: ClassificationInvalidated;
};

const noUnderstandingOutcome: UnderstandingOutcome = { checks: [], warnings: [] };

function classificationRecord(value: TaskClassification): TaskClassificationRecord {
  return {
    verdict: value.verdict,
    basis: [...value.basis],
    evidence: [...value.evidence],
    ruleVersion: value.ruleVersion
  };
}

/**
 * Say why VSP026 is live when `.visp/policy.json` does not say so.
 *
 * Activation by artifact is the useful behaviour and the surprising one: a
 * reader who checks policy, sees `false`, and then meets a VSP026 error has
 * been given a contradiction unless something names the other trigger. Emitted
 * only when the gate actually raised something, so a run that passes is not
 * annotated with an explanation of a block that did not happen.
 */
function activationNote(input: {
  readonly taskId: string;
  readonly enabledByPolicy: boolean;
  readonly raised: boolean;
}): readonly string[] {
  if (input.enabledByPolicy || !input.raised) return [];

  return [
    `VSP026 is active for ${input.taskId} because an understanding case export exists at .visp-intel/understanding/${input.taskId}.json, not because .visp/policy.json enables it. Exporting the case is what turns the gate on.`
  ];
}

/**
 * VSP026 at `implement`, and the realized-surface check at `verify`.
 *
 * The classification is recorded at both stages even when the rule is
 * disabled, because the rate at which the rule misclassifies is a measurement
 * and cannot be taken from runs where it happened to be switched on.
 */
async function understandingChecks(input: {
  readonly context: GateContext;
  readonly options: GateEngineOptions;
}): Promise<UnderstandingOutcome> {
  const task = input.context.state.selectedTask;
  const stage = input.options.stage;

  if (task === undefined || (stage !== "implement" && stage !== "verify")) {
    return noUnderstandingOutcome;
  }

  const exportPresent = await understandingExportExists({
    targetPath: input.options.targetPath,
    taskId: task.id
  });
  const declared = await evaluateUnderstandingGate({
    targetPath: input.options.targetPath,
    task,
    exportPresent,
    ...(input.context.state.contextPack === undefined
      ? {}
      : { contextPack: input.context.state.contextPack })
  });
  const enabledByPolicy =
    input.context.policy.policy.rules.requireUnderstandingBeforeBehaviouralImplementation === true;
  // Policy is one of two triggers; an exported case for this task is the other.
  // See `understandingGateActive` for why the second one exists.
  const enabled = understandingGateActive({
    policy: input.context.policy.policy,
    understandingExportExists: exportPresent
  });

  if (stage === "implement") {
    const checks = enabled ? declared.checks : [];

    return {
      // Inactive means today's behaviour exactly: the record is written, the
      // findings are not raised.
      checks,
      warnings: [
        ...declared.warnings,
        ...activationNote({
          taskId: task.id,
          enabledByPolicy,
          raised: checks.some((check) => !check.passed)
        })
      ],
      classification: classificationRecord(declared.classification)
    };
  }

  const realizedSurface = [...sourceChangedFiles(input.context.state)].sort();

  if (realizedSurface.length === 0) {
    return {
      checks: [],
      warnings: [],
      classification: classificationRecord(declared.classification)
    };
  }

  const realized = await evaluateUnderstandingGate({
    targetPath: input.options.targetPath,
    task,
    realizedSurface,
    exportPresent,
    ...(input.context.state.contextPack === undefined
      ? {}
      : { contextPack: input.context.state.contextPack })
  });
  const invalidated =
    declared.classification.verdict === "mechanical" &&
    realized.classification.verdict === "behavioural";
  // The one realized-surface outcome that is enforced, and the reason it is:
  // the task DECLARED a mechanical class and the diff it produced refutes the
  // declaration. Every other mechanical→behavioural move at verify is ordinary
  // scope drift, which the scope rules already own and which would be
  // retroactive to block here; this one is a task having chosen its own gate,
  // and the diff is the strongest evidence there is that the choice was wrong.
  //
  // Enforced only while VSP026 is active, so a project with neither the policy
  // rule nor an exported case sees exactly today's behaviour, and clearable
  // through the ordinary recorded override — VSP026 is not in
  // `nonOverridableRules`.
  const refutedDeclaration =
    invalidated && realized.classification.basis.includes("B4_mechanical_class_refuted_by_surface");
  const blocked = enabled && refutedDeclaration;

  return {
    checks: blocked
      ? [
          {
            ruleId: "VSP026" as const,
            passed: false,
            severity: "error" as const,
            message: `VSP026: task ${task.id} declares taskClass "${task.taskClass ?? "(none)"}", but the change it made is code.`,
            recommendation: `Correct the declared class on ${task.id} so it matches what changed, or record a VSP026 override naming the files.`,
            evidence: realized.classification.evidence.join("; ")
          }
        ]
      : [],
    warnings: [
      ...(invalidated && !refutedDeclaration
        ? [
            `VSP026: task ${task.id} was classified mechanical but its realized change surface classifies behavioural (${realized.classification.basis.join(", ")}). Recorded, not enforced.`
          ]
        : []),
      ...activationNote({ taskId: task.id, enabledByPolicy, raised: blocked })
    ],
    classification: classificationRecord(declared.classification),
    ...(invalidated
      ? {
          classificationInvalidated: {
            declaredVerdict: declared.classification.verdict,
            realizedVerdict: realized.classification.verdict,
            realizedBasis: [...realized.classification.basis],
            realizedSurface
          }
        }
      : {})
  };
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
        new VispError(
          "VALIDATION_FAILED",
          "Visp Kit is not initialized. Run `visp-kit init` first.",
          {
            recovery: "visp-kit init"
          }
        )
      );
    }

    const stageEvaluation = evaluateStage(context, options.stage);
    const authorizationChecks = await oracleAuthorizationChecks({ context, options });
    const decisionChecks = await reviewDecisionChecks({ context, options });
    const understanding = await understandingChecks({ context, options });
    const evaluation = {
      ...stageEvaluation,
      checks: [
        ...stageEvaluation.checks,
        ...assuranceChecks(context),
        ...authorizationChecks,
        ...decisionChecks,
        ...understanding.checks
      ],
      warnings: [...stageEvaluation.warnings, ...understanding.warnings]
    };

    const baseResult = buildGateResult({
      ...(understanding.classification === undefined
        ? {}
        : { taskClassification: understanding.classification }),
      ...(understanding.classificationInvalidated === undefined
        ? {}
        : { classificationInvalidated: understanding.classificationInvalidated }),
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
