import { clarificationsReadiness, planReadiness, specReadiness } from "./artifact-readiness.js";
import { type GateContext } from "./gate-context.js";
import { type GateCheck, type GateEvaluation } from "./gate-result.js";
import {
  check,
  enabled,
  featureCheck,
  filteredChecks,
  output,
  policyChecks,
  readinessCheck,
  taskCheck,
  taskGraphCheck,
  taskMappingChecks,
  validationCommandCheck
} from "./stage-check-helpers.js";

export function evaluateSetupGate(context: GateContext): GateEvaluation {
  const checks: GateCheck[] = [...policyChecks(context, "warning")];
  const state = context.state;

  if (state.initialized) {
    const missing = [
      state.profile === undefined ? ".visp/project.json" : undefined,
      state.config === undefined ? ".visp/config.json" : undefined,
      state.status === undefined ? ".visp/status.json" : undefined
    ].filter((item): item is string => item !== undefined);

    checks.push(
      missing.length === 0
        ? check({
            ruleId: "VSP018",
            passed: true,
            message: "Project setup artifacts exist.",
            recommendation: "Continue.",
            evidence: ".visp/project.json, .visp/config.json, and .visp/status.json are present."
          })
        : check({
            ruleId: "VSP018",
            passed: false,
            severity: "error",
            message: "Required setup artifacts are missing.",
            recommendation:
              "Run visp-kit init --force only if you intend to regenerate setup files.",
            evidence: missing.join(", ")
          })
    );
  }

  return output(context, checks, "setup");
}

export function evaluateFeatureGate(context: GateContext): GateEvaluation {
  const checks = [
    ...policyChecks(context, "warning"),
    enabled(context.policy.policy.rules, "VSP001") && !context.state.scanned
      ? check({
          ruleId: "VSP001",
          passed: false,
          severity: "error",
          message: "Project scan is required before feature workflow.",
          recommendation: "Run visp-kit scan.",
          evidence: ".visp/cache/scan-meta.json is missing or incomplete."
        })
      : check({
          ruleId: "VSP001",
          passed: true,
          message: "Project scan requirement is satisfied.",
          recommendation: "Continue.",
          evidence: context.state.scanned ? "Scan cache is populated." : "Rule is not enabled."
        }),
    enabled(context.policy.policy.rules, "VSP002") && !context.state.constitution
      ? check({
          ruleId: "VSP002",
          passed: false,
          severity: "error",
          message: "Constitution is required before feature workflow.",
          recommendation: "Run visp-kit constitution.",
          evidence: ".visp/memory/constitution.compact.md was not found."
        })
      : check({
          ruleId: "VSP002",
          passed: true,
          message: "Constitution requirement is satisfied.",
          recommendation: "Continue.",
          evidence: context.state.constitution
            ? "Compact constitution exists."
            : "Rule is not enabled."
        })
  ];

  return output(context, filteredChecks(context, checks), "feature");
}

export function evaluateClarifyGate(context: GateContext): GateEvaluation {
  return output(context, [...policyChecks(context, "warning"), featureCheck(context)], "clarify");
}

export function evaluateSpecGate(context: GateContext): GateEvaluation {
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    // Presence is not usability. `visp-kit clarify` writes an artifact whose
    // every field is the literal "TBD", and `visp-kit spec` refuses it — so a
    // gate that passed on existence authorized a stage the product rejects.
    readinessCheck({
      ruleId: "VSP003",
      readiness: clarificationsReadiness(context.state),
      artifactPath: ".visp/features/<feature>/clarifications.json",
      ownerCommand: "visp-kit clarify",
      missingMessage: "Clarifications are missing.",
      incompleteMessage: "Clarifications are present but unresolved.",
      readyMessage: "Clarifications are resolved.",
      severity: context.policy.policy.strictnessMode === "relaxed" ? "warning" : "error"
    })
  ];

  return output(context, filteredChecks(context, checks), "spec");
}

export function evaluatePlanGate(context: GateContext): GateEvaluation {
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    // `visp-kit spec` generates a draft whose single requirement is titled
    // "TBD". Counting requirements accepted that draft; `visp-kit plan` does
    // not. Both sides now read the same validator.
    readinessCheck({
      ruleId: "VSP004",
      readiness: specReadiness(context.state),
      artifactPath: ".visp/features/<feature>/spec.json",
      ownerCommand: "visp-kit spec",
      missingMessage: "Spec is missing.",
      incompleteMessage: "Spec is present but incomplete.",
      readyMessage: "Spec is complete.",
      severity: "error"
    })
  ];

  return output(context, filteredChecks(context, checks), "plan");
}

export function evaluateTasksGate(context: GateContext): GateEvaluation {
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    // Task decomposition is derived from the spec and the plan. Authorizing it
    // from placeholders produces tasks nobody can implement, and `visp-kit
    // tasks` refuses the plan half of that itself.
    readinessCheck({
      ruleId: "VSP004",
      readiness: specReadiness(context.state),
      artifactPath: ".visp/features/<feature>/spec.json",
      ownerCommand: "visp-kit spec",
      missingMessage: "Spec is missing.",
      incompleteMessage: "Spec is present but incomplete.",
      readyMessage: "Spec is complete.",
      severity: "error"
    }),
    readinessCheck({
      ruleId: "VSP005",
      readiness: planReadiness(context.state),
      artifactPath: ".visp/features/<feature>/plan.json",
      ownerCommand: "visp-kit plan",
      missingMessage: "Plan is missing.",
      incompleteMessage: "Plan is present but incomplete.",
      readyMessage: "Plan is complete.",
      severity: "error"
    })
  ];

  return output(context, filteredChecks(context, checks), "tasks");
}

export function evaluateContextGate(context: GateContext): GateEvaluation {
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    taskGraphCheck(context),
    taskCheck(context, "Run visp-kit tasks."),
    ...taskMappingChecks(context),
    validationCommandCheck(context)
  ];

  return output(context, filteredChecks(context, checks), "context");
}
