import { sourceChangedFiles } from "./artifact-presence.js";
import { type GateContext } from "./gate-context.js";
import { nextAllowedCommand } from "./next-command.js";
import { type GateCheck, type GateEvaluation } from "./gate-result.js";
import { concreteScopePaths, taskScopeChecks } from "./task-gate-checks.js";
import {
  bareCommandFromRecommendation,
  check,
  featureCheck,
  filteredChecks,
  implementationChecklistCheck,
  output,
  policyChecks,
  taskCheck,
  taskGraphCheck,
  taskMappingChecks,
  validationCommandCheck
} from "./stage-check-helpers.js";

export {
  bareCommandFromRecommendation,
  readyCommand,
  readyCommandBare
} from "./stage-check-helpers.js";
export {
  evaluateClarifyGate,
  evaluateContextGate,
  evaluateFeatureGate,
  evaluatePlanGate,
  evaluateSetupGate,
  evaluateSpecGate,
  evaluateTasksGate
} from "./stage-checks-preparation.js";

export function evaluateImplementGate(context: GateContext): GateEvaluation {
  const contextCheck = context.state.artifactSummary.context
    ? check({
        ruleId: "VSP007",
        passed: true,
        message: "Context pack exists.",
        recommendation: "Continue.",
        evidence: "Task context JSON was loaded."
      })
    : check({
        ruleId: "VSP007",
        passed: false,
        severity: "error",
        message: "Implementation requires a context pack.",
        recommendation: "Run visp-kit context --next.",
        evidence: "Task context JSON was not found."
      });
  const budgetCheck =
    context.state.contextPack?.overBudget && context.policy.policy.strictnessMode === "locked"
      ? [
          check({
            ruleId: "VSP007",
            passed: false,
            severity: "warning",
            message: "Context pack is over budget in locked mode.",
            recommendation: "Split the task or regenerate leaner context.",
            evidence: context.state.contextPack.recommendation
          })
        ]
      : [];
  const reportChecks = [
    context.state.verification?.success === false
      ? check({
          ruleId: "VSP014",
          passed: false,
          severity: "error",
          message: "Existing verification report failed.",
          recommendation: `Run visp-kit verify --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
          evidence: "verification.json success is false."
        })
      : undefined,
    context.state.review?.result === "failed"
      ? check({
          ruleId: "VSP015",
          passed: false,
          severity: "error",
          message: "Existing review report failed.",
          recommendation: `Run visp-kit review --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
          evidence: "review result is failed."
        })
      : undefined,
    context.state.reconcile?.result === "failed"
      ? check({
          ruleId: "VSP016",
          passed: false,
          severity: "error",
          message: "Existing reconciliation report failed.",
          recommendation: `Run visp-kit reconcile --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
          evidence: "reconcile result is failed."
        })
      : undefined
  ].filter((item): item is GateCheck => item !== undefined);
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    taskCheck(context, "Run visp-kit context --next."),
    contextCheck,
    ...budgetCheck,
    ...taskMappingChecks(context),
    validationCommandCheck(context),
    ...taskScopeChecks(context.state),
    ...reportChecks,
    ...concurrentAuthorizationChecks(context)
  ];

  return output(context, filteredChecks(context, checks), "implement");
}

function concurrentAuthorizationChecks(context: GateContext): readonly GateCheck[] {
  const task = context.state.selectedTask;
  if (task === undefined) return [];
  const otherMarkers = context.activeMarkers.filter((marker) => marker.taskId !== task.id);
  if (otherMarkers.length === 0) return [];
  const strictModes =
    context.policy.policy.strictnessMode === "strict" ||
    context.policy.policy.strictnessMode === "locked";
  const taskScope = new Set(
    concreteScopePaths([...task.allowedFiles, ...(task.expectedFiles ?? [])])
  );
  const checks: GateCheck[] = [];
  for (const marker of otherMarkers) {
    const overlap = concreteScopePaths([...marker.allowedFiles, ...marker.expectedFiles]).filter(
      (path) => taskScope.has(path)
    );
    if (overlap.length > 0) {
      checks.push(
        check({
          ruleId: "VSP012",
          passed: false,
          severity: strictModes ? "error" : "warning",
          message: `Task ${task.id} overlaps the active authorization for ${marker.taskId}.`,
          recommendation: `Run visp-kit done --task ${marker.taskId} first, or adjust the task scopes so they do not share files.`,
          evidence: `Shared files: ${overlap.join(", ")}.`
        })
      );
    }
  }
  if (checks.length === 0 && !task.parallelizable) {
    checks.push(
      check({
        ruleId: "VSP012",
        passed: false,
        severity: "warning",
        message: `Task ${task.id} is not marked parallelizable but other tasks are authorized (${otherMarkers.map((marker) => marker.taskId).join(", ")}).`,
        recommendation:
          "Finish the other tasks first, or mark this task parallelizable in the task graph if concurrent work is intended.",
        evidence: "Concurrent implement authorizations exist."
      })
    );
  }
  return checks;
}

export function evaluateVerifyGate(context: GateContext): GateEvaluation {
  const noChanges = context.state.git.isRepo && sourceChangedFiles(context.state).length === 0;
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    taskCheck(context, "Run visp-kit context --next."),
    context.state.artifactSummary.context
      ? check({
          ruleId: "VSP007",
          passed: true,
          message: "Context pack exists.",
          recommendation: "Continue.",
          evidence: "Task context JSON was loaded."
        })
      : check({
          ruleId: "VSP007",
          passed: false,
          severity: context.policy.policy.strictnessMode === "locked" ? "error" : "warning",
          message: "Context pack is missing.",
          recommendation: `Run visp-kit context ${context.state.selectedTask?.id ?? "--next"}.`,
          evidence: "Task context JSON was not found."
        }),
    validationCommandCheck(context),
    noChanges
      ? check({
          ruleId: "VSP020",
          passed: false,
          severity: "warning",
          message: "No source changes were detected.",
          recommendation: "Implement the selected task before verification.",
          evidence: "Git diff has no non-.visp changed files."
        })
      : check({
          ruleId: "VSP020",
          passed: true,
          message: "Verification can proceed.",
          recommendation: "Continue.",
          evidence: context.state.git.isRepo
            ? "Source changes were detected or Git is unavailable."
            : "Git is unavailable."
        })
  ];

  return output(context, filteredChecks(context, checks), "verify");
}

export function evaluateReviewGate(context: GateContext): GateEvaluation {
  const verificationMissing = context.state.verification === undefined;
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    taskCheck(context, "Run visp-kit verify --task <task-id>."),
    verificationMissing
      ? check({
          ruleId: "VSP014",
          passed: false,
          severity: context.policy.policy.strictnessMode === "relaxed" ? "warning" : "error",
          message: "Verification report is missing.",
          recommendation: `Run visp-kit verify --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
          evidence: ".visp/features/<feature>/verification.json was not found."
        })
      : context.state.verification?.success === false
        ? check({
            ruleId: "VSP014",
            passed: false,
            severity: "error",
            message: "Verification failed.",
            recommendation: `Fix issues and rerun visp-kit verify --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
            evidence: "verification.json success is false."
          })
        : check({
            ruleId: "VSP014",
            passed: true,
            message: "Verification evidence passed.",
            recommendation: "Continue.",
            evidence: "verification.json success is true."
          })
  ];

  return output(context, filteredChecks(context, checks), "review");
}

export function evaluateReconcileGate(context: GateContext): GateEvaluation {
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    taskCheck(context, "Run visp-kit review --task <task-id>."),
    context.state.review === undefined
      ? check({
          ruleId: "VSP015",
          passed: false,
          severity: context.policy.policy.strictnessMode === "relaxed" ? "warning" : "error",
          message: "Review report is missing.",
          recommendation: `Run visp-kit review --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
          evidence: ".visp/features/<feature>/review/<task>.review.json was not found."
        })
      : context.state.review.result === "failed"
        ? check({
            ruleId: "VSP015",
            passed: false,
            severity: "error",
            message: "Review failed.",
            recommendation: "Fix review findings, then rerun verify and review.",
            evidence: "review result is failed."
          })
        : check({
            ruleId: "VSP015",
            passed: true,
            message: "Review evidence is available.",
            recommendation: "Continue.",
            evidence: `review result is ${context.state.review.result}.`
          }),
    context.state.verification === undefined || context.state.verification.success === false
      ? check({
          ruleId: "VSP014",
          passed: false,
          severity: context.policy.policy.strictnessMode === "relaxed" ? "warning" : "error",
          message: "Passing verification evidence is missing.",
          recommendation: `Run visp-kit verify --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
          evidence:
            context.state.verification === undefined
              ? "verification.json missing."
              : "verification failed."
        })
      : check({
          ruleId: "VSP014",
          passed: true,
          message: "Verification evidence passed.",
          recommendation: "Continue.",
          evidence: "verification.json success is true."
        }),
    context.state.traceability === undefined
      ? check({
          ruleId: "VSP017",
          passed: false,
          severity: "warning",
          message: "Traceability artifact is missing.",
          recommendation: "Run visp-kit tasks or reconcile with --update-traceability.",
          evidence: "traceability.json was not found."
        })
      : check({
          ruleId: "VSP017",
          passed: true,
          message: "Traceability artifact exists.",
          recommendation: "Continue.",
          evidence: "traceability.json was loaded."
        })
  ];

  return output(context, filteredChecks(context, checks), "reconcile");
}

export function evaluatePrGate(context: GateContext): GateEvaluation {
  const taskId = context.state.selectedTask?.id ?? "<task-id>";
  const strictPrEvidence =
    context.policy.policy.strictnessMode === "strict" ||
    context.policy.policy.strictnessMode === "locked";
  const verificationSeverity = strictPrEvidence ? "error" : "warning";
  const reviewSeverity = strictPrEvidence ? "error" : "warning";
  const reconcileSeverity = context.policy.policy.rules.requireReconcileBeforePr
    ? "error"
    : "warning";
  const traceabilitySeverity = context.policy.policy.rules.requireTraceabilityUpdateBeforePr
    ? "error"
    : "warning";
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    taskGraphCheck(context),
    context.state.verification?.success === true
      ? check({
          ruleId: "VSP014",
          passed: true,
          message: "Verification passed.",
          recommendation: "Continue.",
          evidence: "verification.json success is true."
        })
      : check({
          ruleId: "VSP014",
          passed: false,
          severity: verificationSeverity,
          message: "Passing verification evidence is missing.",
          recommendation: `Run visp-kit verify --task ${taskId}.`,
          evidence:
            context.state.verification === undefined
              ? "verification.json missing."
              : "verification failed."
        }),
    context.state.review !== undefined && context.state.review.result !== "failed"
      ? check({
          ruleId: "VSP015",
          passed: true,
          message: "Review evidence is acceptable.",
          recommendation: "Continue.",
          evidence: `review result is ${context.state.review.result}.`
        })
      : check({
          ruleId: "VSP015",
          passed: false,
          severity: reviewSeverity,
          message: "Passing review evidence is missing.",
          recommendation: `Run visp-kit review --task ${taskId}.`,
          evidence: context.state.review === undefined ? "review report missing." : "review failed."
        }),
    context.state.reconcile !== undefined && context.state.reconcile.result !== "failed"
      ? check({
          ruleId: "VSP016",
          passed: true,
          message: "Reconciliation evidence is acceptable.",
          recommendation: "Continue.",
          evidence: `reconcile result is ${context.state.reconcile.result}.`
        })
      : check({
          ruleId: "VSP016",
          passed: false,
          severity: reconcileSeverity,
          message: "Passing reconciliation evidence is missing.",
          recommendation: `Run visp-kit reconcile --task ${taskId} --update-traceability.`,
          evidence:
            context.state.reconcile === undefined
              ? "reconcile report missing."
              : "reconcile failed."
        }),
    context.state.reconcile?.traceabilityUpdate.performed === true
      ? check({
          ruleId: "VSP017",
          passed: true,
          message: "Traceability update evidence exists.",
          recommendation: "Continue.",
          evidence: "reconcile traceabilityUpdate.performed is true."
        })
      : check({
          ruleId: "VSP017",
          passed: false,
          severity: traceabilitySeverity,
          message: "Traceability update evidence is missing.",
          recommendation: `Run visp-kit reconcile --task ${taskId} --update-traceability.`,
          evidence: "reconcile report does not show traceabilityUpdate.performed."
        }),
    implementationChecklistCheck(context),
    ...taskScopeChecks(context.state),
    ...driftChecks(context)
  ];

  return output(context, filteredChecks(context, checks), "pr");
}

function driftChecks(context: GateContext): readonly GateCheck[] {
  if (context.state.contextPack === undefined) return [];
  const strictModes =
    context.policy.policy.strictnessMode === "strict" ||
    context.policy.policy.strictnessMode === "locked";
  const ruleEnabled = context.policy.policy.rules.blockOnUnresolvedDrift ?? strictModes;
  if (!ruleEnabled) return [];
  if (context.staleContextArtifacts.length === 0) {
    return [
      check({
        ruleId: "VSP021",
        passed: true,
        message: "Context pack provenance matches current artifacts.",
        recommendation: "Continue.",
        evidence: "All provenance hashes match current artifact content."
      })
    ];
  }
  const taskId = context.state.contextPack.taskId;
  const staleList = context.staleContextArtifacts
    .map((artifact) => `${artifact.label} (${artifact.path})`)
    .join(", ");
  return [
    check({
      ruleId: "VSP021",
      passed: false,
      severity: strictModes ? "error" : "warning",
      message: "Context pack was grounded on artifacts that changed afterwards.",
      recommendation: `Run visp-kit drift, then regenerate the context pack: visp-kit context ${taskId}.`,
      evidence: `Stale provenance: ${staleList}.`
    })
  ];
}

export function evaluateNextGate(context: GateContext): GateEvaluation {
  const next = nextAllowedCommand(context);
  const checks: GateCheck[] = [];

  if (!context.state.initialized) {
    checks.push(
      check({
        ruleId: "VSP018",
        passed: false,
        severity: "error",
        message: "Visp Kit is not initialized.",
        recommendation: "Run visp-kit init.",
        evidence: ".visp/ was not found."
      })
    );
  } else if (!context.policy.policyValid) {
    checks.push(
      check({
        ruleId: "VSP018",
        passed: false,
        severity: "error",
        message: "Policy validation failed.",
        recommendation: "Run visp-kit policy validate.",
        evidence: context.policy.errors.join(" ")
      })
    );
  } else if (!context.policy.policyExists) {
    checks.push(
      check({
        ruleId: "VSP018",
        passed: false,
        severity: "error",
        message: "Policy file is missing.",
        recommendation: "Run visp-kit policy init --strictness strict.",
        evidence: ".visp/policy.json was not found."
      })
    );
  } else if (context.policy.policy.rules.requireScanBeforeFeature && !context.state.scanned) {
    checks.push(
      check({
        ruleId: "VSP001",
        passed: false,
        severity: "error",
        message: "Project scan is required.",
        recommendation: "Run visp-kit scan.",
        evidence: "Strict policy requires scan before feature workflow."
      })
    );
  } else if (
    context.policy.policy.rules.requireConstitutionBeforeFeature &&
    !context.state.constitution
  ) {
    checks.push(
      check({
        ruleId: "VSP002",
        passed: false,
        severity: "error",
        message: "Project constitution is required.",
        recommendation: "Run visp-kit constitution.",
        evidence: "Strict policy requires constitution before feature workflow."
      })
    );
  } else {
    checks.push(
      check({
        ruleId: "VSP020",
        passed: true,
        message: "Next command was determined.",
        recommendation: next,
        evidence: next
      })
    );
  }

  const selectedRecommendation = checks.find((item) => !item.passed)?.recommendation ?? next;
  const selectedNextCommand =
    bareCommandFromRecommendation(selectedRecommendation) ?? selectedRecommendation;

  return {
    checks,
    warnings: [...context.policy.warnings],
    nextAllowedCommand: selectedNextCommand,
    nextCommand: selectedNextCommand
  };
}
