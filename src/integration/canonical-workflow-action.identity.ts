import path from "node:path";

import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type NextStep } from "../orchestrator/next-step.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { canonicalJsonV1, sortedUnique } from "./canonical-json.js";
import {
  type AddFinding,
  available,
  normalizeRiskFactors,
  unavailable
} from "./canonical-workflow-action.findings.js";
import {
  type CanonicalWorkflowPhase,
  type DeclaredValue
} from "./canonical-workflow-action.types.js";

const strictnessModes = new Set<StrictnessMode>(["relaxed", "standard", "strict", "locked"]);

export function phaseFromState(state: string): CanonicalWorkflowPhase {
  if (["not-initialized", "scan-needed", "constitution-needed"].includes(state)) {
    return "setup";
  }
  if (state === "feature-needed") return "feature";
  if (state.startsWith("clarify-")) return "clarify";
  if (state.startsWith("spec-")) return "spec";
  if (state.startsWith("plan-")) return "plan";
  if (state.startsWith("tasks-") || state === "task-missing") return "tasks";
  if (
    state.startsWith("context-") ||
    state.startsWith("next-task-") ||
    state.startsWith("checklist-")
  ) {
    return "context";
  }
  if (state.startsWith("implementation-")) return "implement";
  if (state.startsWith("verify-") || state.startsWith("verification-")) return "verify";
  if (state.startsWith("review-")) return "review";
  if (state.startsWith("reconcile-") || state.startsWith("traceability-update-")) {
    return "reconcile";
  }
  if (state.startsWith("pr-") || state === "ready-for-pr") return "pr";
  return "next";
}

export function taskIdentityMatches(
  task: Task | undefined,
  stepTask: NonNullable<NextStep["task"]>
): boolean {
  return (
    task !== undefined &&
    task.id === stepTask.id &&
    task.title === stepTask.title &&
    task.status === stepTask.status
  );
}

export function isExactNextTaskTransition(state: ProjectState, step: NextStep): boolean {
  const selectedTask = state.selectedTask;
  const stepTask = step.task;
  if (
    step.state !== "next-task-needed" ||
    selectedTask === undefined ||
    stepTask === null ||
    (selectedTask.status !== "done" && selectedTask.status !== "verified")
  ) {
    return false;
  }

  const graphTasks = state.taskGraph?.tasks ?? [];
  const nextTask = graphTasks.find((task) => task.status !== "done" && task.status !== "verified");
  const matchingTasks = graphTasks.filter((task) => task.id === stepTask.id);

  return (
    nextTask !== undefined &&
    nextTask.id !== selectedTask.id &&
    nextTask.id === stepTask.id &&
    matchingTasks.length === 1 &&
    nextTask.title === stepTask.title &&
    nextTask.status === stepTask.status
  );
}

export function stableTaskSource(task: Task): object {
  const normalizedPaths = (values: readonly string[] | undefined): readonly string[] | null =>
    values === undefined ? null : sortedUnique(values.map((value) => value.replaceAll("\\", "/")));

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    requirementIds: sortedUnique(task.requirementIds),
    acceptanceCriterionIds: sortedUnique(task.acceptanceCriterionIds),
    dependsOn: sortedUnique(task.dependsOn),
    allowedFiles: normalizedPaths(task.allowedFiles),
    expectedFiles: normalizedPaths(task.expectedFiles),
    forbiddenFiles: normalizedPaths(task.forbiddenFiles),
    validationCommands: [...task.validationCommands],
    parallelizable: task.parallelizable,
    riskLevel: task.riskLevel,
    ...(task.taskClass === undefined ? {} : { taskClass: task.taskClass }),
    ...(task.riskFactors === undefined
      ? {}
      : { riskFactors: normalizeRiskFactors(task.riskFactors) })
  };
}

export function strictnessContext(
  strictness: string | undefined,
  addFinding: AddFinding
): {
  readonly level: "kit_strict" | "advisory";
  readonly workflowStrictness: DeclaredValue<StrictnessMode>;
} {
  if (strictness === undefined) {
    return { level: "advisory", workflowStrictness: unavailable("not_captured") };
  }
  if (!strictnessModes.has(strictness as StrictnessMode)) {
    addFinding(
      {
        code: "VISP.CONTRACT.STRICTNESS_INVALID",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: `Workflow strictness is unsupported: ${JSON.stringify(strictness)}.`,
        recommendation: "Re-evaluate the action with a valid Kit strictness mode.",
        evidence: [strictness]
      },
      true
    );
    return { level: "advisory", workflowStrictness: unavailable("source_invalid") };
  }

  const value = strictness as StrictnessMode;
  return {
    level: value === "strict" || value === "locked" ? "kit_strict" : "advisory",
    workflowStrictness: available(value)
  };
}

export function identityFindings(
  state: ProjectState,
  step: NextStep,
  addFinding: AddFinding
): void {
  if (path.resolve(state.targetPath) !== path.resolve(step.targetPath)) {
    addFinding(
      {
        code: "VISP.CONTRACT.TARGET_PATH_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Project state and next-step target paths disagree.",
        recommendation: "Reload project state and recompute the next action for one project root.",
        evidence: ["target-paths-differ"]
      },
      true
    );
  }

  const feature = state.selectedFeature;
  if (
    step.feature !== null &&
    (feature === undefined || step.feature.id !== feature.id || step.feature.slug !== feature.slug)
  ) {
    addFinding(
      {
        code: "VISP.CONTRACT.FEATURE_IDENTITY_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Project state and next-step feature identity disagree.",
        recommendation: "Reload project state and recompute the next action.",
        evidence: [feature?.id ?? "null", step.feature.id]
      },
      true
    );
  }

  const task = state.selectedTask;
  if (
    step.task !== null &&
    !taskIdentityMatches(task, step.task) &&
    !isExactNextTaskTransition(state, step)
  ) {
    addFinding(
      {
        code: "VISP.CONTRACT.TASK_IDENTITY_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Project state and next-step task identity disagree.",
        recommendation: "Reload project state and recompute the next action.",
        evidence: [task?.id ?? "null", step.task.id]
      },
      true
    );
  }
}

export function sourceIdentityFindings(state: ProjectState, addFinding: AddFinding): void {
  const feature = state.selectedFeature;
  const task = state.selectedTask;
  const mismatches: string[] = [];

  if (feature !== undefined && feature.intent !== undefined) {
    if (feature.intent.id !== feature.id) mismatches.push(`intent:${feature.intent.id}`);
    if (feature.intent.slug !== feature.slug) mismatches.push(`intent:${feature.intent.slug}`);
  }

  if (feature !== undefined && state.spec !== undefined) {
    if (state.spec.featureId !== feature.id) mismatches.push(`spec:${state.spec.featureId}`);
    if (state.spec.featureSlug !== feature.slug) mismatches.push(`spec:${state.spec.featureSlug}`);
  }
  if (feature !== undefined && state.taskGraph !== undefined) {
    if (state.taskGraph.featureId !== feature.id) {
      mismatches.push(`task-graph:${state.taskGraph.featureId}`);
    }
    if (state.taskGraph.featureSlug !== undefined && state.taskGraph.featureSlug !== feature.slug) {
      mismatches.push(`task-graph:${state.taskGraph.featureSlug}`);
    }
  }
  if (feature !== undefined && state.plan !== undefined) {
    if (state.plan.featureId !== feature.id) mismatches.push(`plan:${state.plan.featureId}`);
    if (state.plan.featureSlug !== feature.slug) mismatches.push(`plan:${state.plan.featureSlug}`);
  }
  if (task !== undefined) {
    const graphMatches =
      state.taskGraph?.tasks.filter((candidate) => candidate.id === task.id) ?? [];
    if (state.taskGraph === undefined) {
      mismatches.push("task-graph:missing");
    } else if (graphMatches.length === 0) {
      mismatches.push(`task-graph:missing-task:${task.id}`);
    } else if (graphMatches.length > 1) {
      mismatches.push(`task-graph:duplicate-task:${task.id}`);
    } else if (canonicalJsonV1(graphMatches[0]) !== canonicalJsonV1(task)) {
      mismatches.push(`task-graph:stale-task:${task.id}`);
    }
  }
  if (state.contextPack !== undefined) {
    if (feature === undefined || state.contextPack.featureId !== feature.id) {
      mismatches.push(`context-feature:${state.contextPack.featureId}`);
    }
    if (feature === undefined || state.contextPack.featureSlug !== feature.slug) {
      mismatches.push(`context-slug:${state.contextPack.featureSlug}`);
    }
    if (task === undefined || state.contextPack.taskId !== task.id) {
      mismatches.push(`context-task:${state.contextPack.taskId}`);
    }
    if (task === undefined || state.contextPack.selectedTask.id !== task.id) {
      mismatches.push(`context-selected-task:${state.contextPack.selectedTask.id}`);
    } else if (
      canonicalJsonV1(stableTaskSource(state.contextPack.selectedTask)) !==
      canonicalJsonV1(stableTaskSource(task))
    ) {
      mismatches.push(`context-selected-task:stale:${task.id}`);
    }
  }

  if (mismatches.length > 0) {
    addFinding(
      {
        code: "VISP.CONTRACT.SOURCE_IDENTITY_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Task-scoped source artifacts disagree with selected project identity.",
        recommendation: "Regenerate the selected task context from coherent feature artifacts.",
        evidence: mismatches
      },
      true
    );
  }
}

export function projectStateFindings(
  state: ProjectState,
  nextCommand: string,
  addFinding: AddFinding
): void {
  for (const error of state.errors) {
    addFinding(
      {
        code: "VISP.CONTRACT.PROJECT_STATE_ERROR",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: error,
        recommendation: "Resolve the exact project selection error and recompute the action.",
        evidence: [error]
      },
      true
    );
  }

  for (const warning of state.warnings) {
    addFinding({
      code: "VISP.WORKFLOW.WARNING",
      source: "workflow",
      severity: "warning",
      effect: "none",
      message: warning,
      recommendation: nextCommand,
      evidence: [warning]
    });
  }

  if (state.selectedFeature !== undefined && state.selectedFeature.intent === undefined) {
    const intentPath = `${state.selectedFeature.relativePath}/intent.json`;
    addFinding(
      {
        code: "VISP.CONTRACT.FEATURE_INTENT_UNAVAILABLE",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "The selected feature intent is missing or invalid.",
        recommendation: "Restore or regenerate a valid feature intent before using this action.",
        evidence: [intentPath]
      },
      true
    );
  }
}
