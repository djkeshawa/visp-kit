import { type GateStage } from "../artifacts/schemas/gate.schema.js";
import { type PolicyRules } from "../artifacts/schemas/policy.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { hasValidationFallback, sourceChangedFiles } from "./artifact-presence.js";
import { type GateContext } from "./gate-context.js";
import { nextAllowedCommand } from "./next-command.js";
import { ruleById, type GateRuleId } from "./gate-rules.js";
import { type GateCheck, type GateEvaluation } from "./gate-result.js";
import { isBehaviorTask, taskScopeChecks } from "./task-gate-checks.js";

function enabled(rules: PolicyRules, ruleId: GateRuleId): boolean {
  const rule = ruleById(ruleId);

  // Fail closed: a rule id without a definition stays enforced rather than
  // silently disabled.
  return rule === undefined ? true : Boolean(rules[rule.key]);
}

function check(input: GateCheck): GateCheck {
  return input;
}

function policyChecks(
  context: GateContext,
  missingPolicySeverity: "warning" | "error"
): readonly GateCheck[] {
  const checks: GateCheck[] = [];

  if (!context.policy.initialized) {
    checks.push(
      check({
        ruleId: "VSP018",
        passed: false,
        severity: "error",
        message: "Visp Kit is not initialized.",
        recommendation: "Run visp init.",
        evidence: ".visp/ was not found."
      })
    );
    return checks;
  }

  if (!context.policy.policyValid) {
    checks.push(
      check({
        ruleId: "VSP018",
        passed: false,
        severity: "error",
        message: "Policy validation failed.",
        recommendation: "Run visp policy validate and fix .visp/policy.json.",
        evidence: context.policy.errors.join(" ")
      })
    );
    return checks;
  }

  if (!context.policy.policyExists) {
    checks.push(
      check({
        ruleId: "VSP018",
        passed: false,
        severity: missingPolicySeverity,
        message: "Policy file is missing.",
        recommendation: "Run visp policy init --strictness strict.",
        evidence: ".visp/policy.json was not found; default policy was used in memory."
      })
    );
    return checks;
  }

  checks.push(
    check({
      ruleId: "VSP018",
      passed: true,
      message: "Policy is valid.",
      recommendation: "Continue.",
      evidence: ".visp/policy.json was loaded successfully."
    })
  );

  return checks;
}

function featureCheck(context: GateContext): GateCheck {
  const feature = context.state.selectedFeature;

  return feature === undefined
    ? check({
        ruleId: "VSP019",
        passed: false,
        severity: "error",
        message: "No active feature is selected.",
        recommendation: 'Run visp feature "<describe your feature>".',
        evidence: ".visp/status.json does not identify an active feature."
      })
    : check({
        ruleId: "VSP019",
        passed: true,
        message: "Feature intent is available.",
        recommendation: "Continue.",
        evidence: `${feature.id}-${feature.slug}`
      });
}

function taskCheck(context: GateContext, recommendation = "Run visp tasks."): GateCheck {
  const task = context.state.selectedTask;

  return task === undefined
    ? check({
        ruleId: "VSP006",
        passed: false,
        severity: "error",
        message: "No task is selected.",
        recommendation,
        evidence: "No task was resolved from --task, activeTaskId, or task graph."
      })
    : check({
        ruleId: "VSP006",
        passed: true,
        message: "Selected task exists.",
        recommendation: "Continue.",
        evidence: task.id
      });
}

function taskMappingChecks(context: GateContext): readonly GateCheck[] {
  const task = context.state.selectedTask;

  if (task === undefined) return [];

  const checks: GateCheck[] = [];
  const requirementIds = new Set(context.state.spec?.requirements.map((req) => req.id) ?? []);
  const acceptanceCriterionIds = new Set(
    context.state.spec?.acceptanceCriteria.map((criterion) => criterion.id) ?? []
  );
  const missingRequirements = task.requirementIds.filter(
    (id) => requirementIds.size > 0 && !requirementIds.has(id)
  );
  const missingCriteria = task.acceptanceCriterionIds.filter(
    (id) => acceptanceCriterionIds.size > 0 && !acceptanceCriterionIds.has(id)
  );

  checks.push(
    task.requirementIds.length === 0
      ? check({
          ruleId: "VSP008",
          passed: false,
          severity: "error",
          message: "Task has no requirement mapping.",
          recommendation: "Update task-graph.json, then run visp tasks --validate.",
          evidence: `${task.id}.requirementIds is empty.`
        })
      : missingRequirements.length > 0
        ? check({
            ruleId: "VSP008",
            passed: false,
            severity: "error",
            message: "Task references missing requirements.",
            recommendation: "Update task requirementIds or regenerate the spec/task graph.",
            evidence: missingRequirements.join(", ")
          })
        : check({
            ruleId: "VSP008",
            passed: true,
            message: "Task requirement mapping exists.",
            recommendation: "Continue.",
            evidence: task.requirementIds.join(", ")
          })
  );

  checks.push(
    isBehaviorTask(task) && task.acceptanceCriterionIds.length === 0
      ? check({
          ruleId: "VSP009",
          passed: false,
          severity: "error",
          message: "Behavior task has no acceptance criterion mapping.",
          recommendation: "Update task-graph.json with acceptanceCriterionIds.",
          evidence: `${task.id}.acceptanceCriterionIds is empty.`
        })
      : missingCriteria.length > 0
        ? check({
            ruleId: "VSP009",
            passed: false,
            severity: "error",
            message: "Task references missing acceptance criteria.",
            recommendation: "Update task acceptanceCriterionIds or regenerate the spec/task graph.",
            evidence: missingCriteria.join(", ")
          })
        : check({
            ruleId: "VSP009",
            passed: true,
            message: "Task acceptance criteria mapping is acceptable.",
            recommendation: "Continue.",
            evidence: task.acceptanceCriterionIds.join(", ") || "Task is not behavior-sensitive."
          })
  );

  return checks;
}

function validationCommandCheck(context: GateContext): GateCheck {
  const task = context.state.selectedTask;
  const hasCommands =
    (task?.validationCommands.length ?? 0) > 0 ||
    (context.state.contextPack?.validationCommands.length ?? 0) > 0 ||
    hasValidationFallback(context.state);

  return hasCommands
    ? check({
        ruleId: "VSP010",
        passed: true,
        message: "Validation commands are available.",
        recommendation: "Continue.",
        evidence: "Task, context, or project profile includes validation commands."
      })
    : check({
        ruleId: "VSP010",
        passed: false,
        severity: "error",
        message: "No validation commands are available.",
        recommendation: "Add validationCommands to the task graph or run visp scan.",
        evidence: "No task, context, or project-level validation commands were found."
      });
}

function implementationChecklistCheck(context: GateContext): GateCheck {
  const taskId = context.state.selectedTask?.id ?? "<task-id>";
  const checklist = context.state.implementationChecklist;

  if (checklist === undefined) {
    return check({
      ruleId: "VSP020",
      passed: false,
      severity: "error",
      message: "Implementation checklist evidence is missing.",
      recommendation: `Run visp context ${taskId}.`,
      evidence: `.visp/features/<feature>/context/${taskId}.implementation-checklist.json was not found.`
    });
  }

  const incomplete = checklist.items.filter(
    (item) => item.required && (item.status === "pending" || item.status === "blocked")
  );

  return incomplete.length === 0
    ? check({
        ruleId: "VSP020",
        passed: true,
        message: "Implementation checklist is complete.",
        recommendation: "Continue.",
        evidence: "All required checklist items are done, unavailable, or not applicable."
      })
    : check({
        ruleId: "VSP020",
        passed: false,
        severity: "error",
        message: "Required implementation checklist items are incomplete.",
        recommendation: `Run visp checklist status --task ${taskId}.`,
        evidence: incomplete.map((item) => `${item.id}:${item.status}`).join(", ")
      });
}

function taskGraphCheck(context: GateContext): GateCheck {
  return context.state.artifactSummary.taskGraph
    ? check({
        ruleId: "VSP006",
        passed: true,
        message: "Task graph exists.",
        recommendation: "Continue.",
        evidence: ".visp/features/<feature>/task-graph.json was loaded."
      })
    : check({
        ruleId: "VSP006",
        passed: false,
        severity: "error",
        message: "Task graph is missing.",
        recommendation: "Run visp tasks.",
        evidence: ".visp/features/<feature>/task-graph.json was not found."
      });
}

function filteredChecks(context: GateContext, checks: readonly GateCheck[]): readonly GateCheck[] {
  return checks.filter((item) => item.passed || enabled(context.policy.policy.rules, item.ruleId));
}

function readyCommand(stage: GateStage, task: Task | undefined): string {
  if (stage === "feature") return 'visp feature "<describe your feature>"';
  if (stage === "implement") {
    return "Read .visp/prompts/current-task.prompt.md and implement only the selected task.";
  }
  if (stage === "context")
    return task === undefined ? "visp context --next" : `visp context ${task.id}`;
  if (["verify", "review", "reconcile"].includes(stage)) {
    const taskFlag = task === undefined ? "" : ` --task ${task.id}`;
    return stage === "reconcile"
      ? `visp reconcile${taskFlag} --update-traceability`
      : `visp ${stage}${taskFlag}`;
  }
  return `visp ${stage}`;
}

function output(
  context: GateContext,
  checks: readonly GateCheck[],
  stage: GateStage
): GateEvaluation {
  const nextFailure = checks.find((item) => !item.passed);

  return {
    checks,
    warnings: [
      ...context.policy.warnings,
      ...context.policy.errors.map((error) => `Policy error: ${error}`)
    ],
    nextAllowedCommand:
      nextFailure?.recommendation ?? readyCommand(stage, context.state.selectedTask)
  };
}

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
            recommendation: "Run visp init --force only if you intend to regenerate setup files.",
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
          recommendation: "Run visp scan.",
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
          recommendation: "Run visp constitution.",
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
    context.state.artifactSummary.clarifications
      ? check({
          ruleId: "VSP003",
          passed: true,
          message: "Clarifications exist.",
          recommendation: "Continue.",
          evidence: ".visp/features/<feature>/clarifications.json exists."
        })
      : check({
          ruleId: "VSP003",
          passed: false,
          severity: context.policy.policy.strictnessMode === "relaxed" ? "warning" : "error",
          message: "Clarifications are missing.",
          recommendation: "Run visp clarify.",
          evidence: ".visp/features/<feature>/clarifications.json was not found."
        })
  ];

  return output(context, filteredChecks(context, checks), "spec");
}

export function evaluatePlanGate(context: GateContext): GateEvaluation {
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    context.state.artifactSummary.spec && (context.state.spec?.requirements.length ?? 0) > 0
      ? check({
          ruleId: "VSP004",
          passed: true,
          message: "Spec exists and has requirements.",
          recommendation: "Continue.",
          evidence: ".visp/features/<feature>/spec.json was loaded."
        })
      : check({
          ruleId: "VSP004",
          passed: false,
          severity: "error",
          message: "Spec is missing or has no requirements.",
          recommendation: "Run visp spec.",
          evidence: ".visp/features/<feature>/spec.json is missing or incomplete."
        })
  ];

  return output(context, filteredChecks(context, checks), "plan");
}

export function evaluateTasksGate(context: GateContext): GateEvaluation {
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    context.state.artifactSummary.spec
      ? check({
          ruleId: "VSP004",
          passed: true,
          message: "Spec exists.",
          recommendation: "Continue.",
          evidence: ".visp/features/<feature>/spec.json was loaded."
        })
      : check({
          ruleId: "VSP004",
          passed: false,
          severity: "error",
          message: "Spec is missing.",
          recommendation: "Run visp spec.",
          evidence: ".visp/features/<feature>/spec.json was not found."
        }),
    context.state.artifactSummary.plan
      ? check({
          ruleId: "VSP005",
          passed: true,
          message: "Plan exists.",
          recommendation: "Continue.",
          evidence: ".visp/features/<feature>/plan.json was loaded."
        })
      : check({
          ruleId: "VSP005",
          passed: false,
          severity: "error",
          message: "Plan is missing.",
          recommendation: "Run visp plan.",
          evidence: ".visp/features/<feature>/plan.json was not found."
        })
  ];

  return output(context, filteredChecks(context, checks), "tasks");
}

export function evaluateContextGate(context: GateContext): GateEvaluation {
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    taskGraphCheck(context),
    taskCheck(context, "Run visp tasks."),
    ...taskMappingChecks(context),
    validationCommandCheck(context)
  ];

  return output(context, filteredChecks(context, checks), "context");
}

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
        recommendation: "Run visp context --next.",
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
          recommendation: `Run visp verify --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
          evidence: "verification.json success is false."
        })
      : undefined,
    context.state.review?.result === "failed"
      ? check({
          ruleId: "VSP015",
          passed: false,
          severity: "error",
          message: "Existing review report failed.",
          recommendation: `Run visp review --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
          evidence: "review result is failed."
        })
      : undefined,
    context.state.reconcile?.result === "failed"
      ? check({
          ruleId: "VSP016",
          passed: false,
          severity: "error",
          message: "Existing reconciliation report failed.",
          recommendation: `Run visp reconcile --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
          evidence: "reconcile result is failed."
        })
      : undefined
  ].filter((item): item is GateCheck => item !== undefined);
  const checks = [
    ...policyChecks(context, "warning"),
    featureCheck(context),
    taskCheck(context, "Run visp context --next."),
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

function concreteScopePaths(paths: readonly string[]): readonly string[] {
  return paths.filter((value) => {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.toUpperCase() !== "TBD" && !trimmed.includes(" ");
  });
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
          recommendation: `Run visp done --task ${marker.taskId} first, or adjust the task scopes so they do not share files.`,
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
        message: `Task ${task.id} is not marked parallelizable but other tasks are authorized (${otherMarkers
          .map((marker) => marker.taskId)
          .join(", ")}).`,
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
    taskCheck(context, "Run visp context --next."),
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
          recommendation: `Run visp context ${context.state.selectedTask?.id ?? "--next"}.`,
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
    taskCheck(context, "Run visp verify --task <task-id>."),
    verificationMissing
      ? check({
          ruleId: "VSP014",
          passed: false,
          severity: context.policy.policy.strictnessMode === "relaxed" ? "warning" : "error",
          message: "Verification report is missing.",
          recommendation: `Run visp verify --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
          evidence: ".visp/features/<feature>/verification.json was not found."
        })
      : context.state.verification?.success === false
        ? check({
            ruleId: "VSP014",
            passed: false,
            severity: "error",
            message: "Verification failed.",
            recommendation: `Fix issues and rerun visp verify --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
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
    taskCheck(context, "Run visp review --task <task-id>."),
    context.state.review === undefined
      ? check({
          ruleId: "VSP015",
          passed: false,
          severity: context.policy.policy.strictnessMode === "relaxed" ? "warning" : "error",
          message: "Review report is missing.",
          recommendation: `Run visp review --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
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
          recommendation: `Run visp verify --task ${context.state.selectedTask?.id ?? "<task-id>"}.`,
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
          recommendation: "Run visp tasks or reconcile with --update-traceability.",
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
          recommendation: `Run visp verify --task ${taskId}.`,
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
          recommendation: `Run visp review --task ${taskId}.`,
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
          recommendation: `Run visp reconcile --task ${taskId} --update-traceability.`,
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
          recommendation: `Run visp reconcile --task ${taskId} --update-traceability.`,
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

  // Optional key: policies written before VSP021 existed fall back to the
  // strictness default (enforced in strict/locked).
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
      recommendation: `Run visp drift, then regenerate the context pack: visp context ${taskId}.`,
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
        recommendation: "Run visp init.",
        evidence: ".visp/ was not found."
      })
    );
  } else if (!context.policy.policyExists) {
    checks.push(
      check({
        ruleId: "VSP018",
        passed: false,
        severity: "error",
        message: "Policy file is missing.",
        recommendation: "Run visp policy init --strictness strict.",
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
        recommendation: "Run visp scan.",
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
        recommendation: "Run visp constitution.",
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

  return {
    checks,
    warnings: [...context.policy.warnings],
    nextAllowedCommand: next
  };
}
