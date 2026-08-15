/**
 * The vocabulary every stage gate is written in.
 *
 * A gate is a list of `GateCheck`s and nothing more: each one names the policy
 * rule it enforces, whether it passed, and the evidence for that answer. The
 * builders here produce the checks that more than one stage needs — policy
 * state, feature and task selection, readiness of the upstream artifact — so a
 * stage evaluator reads as the list of questions that stage asks.
 *
 * `filteredChecks` is what makes policy authoritative: a check whose rule is
 * disabled is dropped here rather than being weakened at the point it is
 * written, so no evaluator can accidentally enforce a rule the project turned
 * off, or skip one it turned on.
 */
import { type GateStage } from "../artifacts/schemas/gate.schema.js";
import { type PolicyRules } from "../artifacts/schemas/policy.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { hasValidationFallback } from "./artifact-presence.js";
import { readinessEvidence, type ArtifactReadiness } from "./artifact-readiness.js";
import { type GateContext } from "./gate-context.js";
import { ruleById, type GateRuleId } from "./gate-rules.js";
import { type GateCheck, type GateEvaluation } from "./gate-result.js";
import { isBehaviorTask } from "./task-gate-checks.js";

export function enabled(rules: PolicyRules, ruleId: GateRuleId): boolean {
  const rule = ruleById(ruleId);
  return rule === undefined ? true : Boolean(rules[rule.key]);
}

export function check(input: GateCheck): GateCheck {
  return input;
}

export function policyChecks(
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
        recommendation: "Run visp-kit init.",
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
        recommendation: "Run visp-kit policy validate and fix .visp/policy.json.",
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
        recommendation: "Run visp-kit policy init --strictness strict.",
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

export function featureCheck(context: GateContext): GateCheck {
  const feature = context.state.selectedFeature;

  return feature === undefined
    ? check({
        ruleId: "VSP019",
        passed: false,
        severity: "error",
        message: "No active feature is selected.",
        recommendation: 'Run visp-kit feature "<describe your feature>".',
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

/**
 * Turn an upstream artifact's readiness into a gate check.
 *
 * The three outcomes are three different repairs, so they must not collapse
 * into one message. Missing means run the generating command. Incomplete means
 * the file is there and the placeholders still need filling in — telling that
 * reader to "run visp-kit spec" sends them to a command that will refuse to
 * overwrite their own work. Ready continues.
 *
 * `evidence` carries the validator's actual reasons rather than a restatement
 * of the verdict, because the whole failure being repaired here was a check
 * whose evidence described something other than what it tested.
 */
export function readinessCheck(input: {
  readonly ruleId: GateRuleId;
  readonly readiness: ArtifactReadiness;
  readonly artifactPath: string;
  /** The command that WRITES this artifact — `visp-kit spec` for spec.json. */
  readonly ownerCommand: string;
  readonly missingMessage: string;
  readonly incompleteMessage: string;
  readonly readyMessage: string;
  readonly severity: "error" | "warning";
}): GateCheck {
  if (input.readiness.state === "ready") {
    return check({
      ruleId: input.ruleId,
      passed: true,
      message: input.readyMessage,
      recommendation: "Continue.",
      evidence: `${input.artifactPath} passed the same validation ${input.ownerCommand} applies.`
    });
  }

  if (input.readiness.state === "missing") {
    return check({
      ruleId: input.ruleId,
      passed: false,
      severity: input.severity,
      message: input.missingMessage,
      recommendation: `Run ${input.ownerCommand}.`,
      evidence: `${input.artifactPath} was not found or could not be read.`
    });
  }

  return check({
    ruleId: input.ruleId,
    passed: false,
    severity: input.severity,
    message: input.incompleteMessage,
    recommendation: `Run ${input.ownerCommand} --validate.`,
    evidence: readinessEvidence(input.readiness.errors)
  });
}

export function taskCheck(context: GateContext, recommendation = "Run visp-kit tasks."): GateCheck {
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

export function taskMappingChecks(context: GateContext): readonly GateCheck[] {
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
          recommendation: "Update task-graph.json, then run visp-kit tasks --validate.",
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

export function validationCommandCheck(context: GateContext): GateCheck {
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
        recommendation: "Add validationCommands to the task graph or run visp-kit scan.",
        evidence: "No task, context, or project-level validation commands were found."
      });
}

export function implementationChecklistCheck(context: GateContext): GateCheck {
  const taskId = context.state.selectedTask?.id ?? "<task-id>";
  const checklist = context.state.implementationChecklist;

  if (checklist === undefined) {
    return check({
      ruleId: "VSP020",
      passed: false,
      severity: "error",
      message: "Implementation checklist evidence is missing.",
      recommendation: `Run visp-kit context ${taskId}.`,
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
        recommendation: `Run visp-kit checklist status --task ${taskId}.`,
        evidence: incomplete.map((item) => `${item.id}:${item.status}`).join(", ")
      });
}

export function taskGraphCheck(context: GateContext): GateCheck {
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
        recommendation: "Run visp-kit tasks.",
        evidence: ".visp/features/<feature>/task-graph.json was not found."
      });
}

export function filteredChecks(
  context: GateContext,
  checks: readonly GateCheck[]
): readonly GateCheck[] {
  return checks.filter((item) => item.passed || enabled(context.policy.policy.rules, item.ruleId));
}

/**
 * The command to run once this stage is allowed.
 *
 * Every command Kit emits must name `visp-kit`. Since the D-118 rename `visp`
 * is HYPER's binary, and the stage names here — spec, plan, tasks, verify,
 * review, pr — are not among Hyper's thirteen verbs. So `visp spec` is not a
 * command any installed binary answers to.
 *
 * `visp plan` is the dangerous one: it does exist as a Hyper verb, but it
 * means "drive the whole preparation loop", not "run Kit's plan stage". Same
 * words, different program, no error to notice.
 *
 * `feature`, `context` and `reconcile` were corrected during the rename; these
 * were missed because nothing compared what Kit emits against what each binary
 * accepts. The test for this asserts the property over every stage rather than
 * the individual strings, so a stage added later cannot reintroduce it.
 */
export function readyCommand(stage: GateStage, task: Task | undefined): string {
  if (stage === "feature") return 'visp-kit feature "<describe your feature>"';
  // Kit has no `setup` command — the stage's Kit-side equivalent is `init`.
  // The pre-rename string here was `visp setup`, which happens to be a real
  // verb of Hyper's, and mapping it mechanically to `visp-kit setup` would
  // have invented a command that does not exist. Kit must recommend only its
  // own commands in any case: it cannot know whether Hyper is installed.
  if (stage === "setup") return "visp-kit init";
  if (stage === "implement") {
    return "Read .visp/prompts/current-task.prompt.md and implement only the selected task.";
  }
  if (stage === "context")
    return task === undefined ? "visp-kit context --next" : `visp-kit context ${task.id}`;
  if (["verify", "review", "reconcile"].includes(stage)) {
    const taskFlag = task === undefined ? "" : ` --task ${task.id}`;
    return stage === "reconcile"
      ? `visp-kit reconcile${taskFlag} --update-traceability`
      : `visp-kit ${stage}${taskFlag}`;
  }
  return `visp-kit ${stage}`;
}

// Bare, machine-runnable form of readyCommand: the same value except the
// implement-ready state, whose sentence maps to running the current-task prompt.
export function readyCommandBare(stage: GateStage, task: Task | undefined): string {
  if (stage === "implement") {
    return "visp-kit context --next";
  }
  return readyCommand(stage, task);
}

// Reduce a recommendation sentence ("Run visp-kit X.") to the bare command
// ("visp-kit X"). Returns undefined when the recommendation is not a runnable
// command. Accepts both CLI names during the D-119 deprecation window —
// recommendations can surface from artifacts written before the rename.
export function bareCommandFromRecommendation(recommendation: string): string | undefined {
  const match = /^Run (visp(?:-kit)? .+?)\.?$/.exec(recommendation.trim());
  return match?.[1];
}

export function output(
  context: GateContext,
  checks: readonly GateCheck[],
  stage: GateStage
): GateEvaluation {
  const nextFailure = checks.find((item) => !item.passed);
  const readyBare = readyCommandBare(stage, context.state.selectedTask);

  return {
    checks,
    warnings: [
      ...context.policy.warnings,
      ...context.policy.errors.map((error) => `Policy error: ${error}`)
    ],
    nextAllowedCommand:
      nextFailure?.recommendation ?? readyCommand(stage, context.state.selectedTask),
    nextCommand:
      nextFailure === undefined
        ? readyBare
        : (bareCommandFromRecommendation(nextFailure.recommendation) ?? readyBare)
  };
}
