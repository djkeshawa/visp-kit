import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { finding, type ReviewFindingDraft } from "./review-findings.js";

function taskLooksBehaviorChanging(task: Task): boolean {
  const text = `${task.title} ${task.description}`.toLowerCase();

  return task.acceptanceCriterionIds.length > 0 ||
    task.riskLevel !== "low" ||
    /add|update|create|delete|validate|calculate|permission|api|persistence|state|workflow/.test(text);
}

export function reviewTraceability(input: {
  readonly taskGraph: TaskGraphArtifact;
  readonly task?: Task;
  readonly spec?: SpecArtifact;
  readonly traceability?: TraceabilityMatrix;
}): {
  readonly traceabilityReview: {
    readonly status: "passed" | "warnings" | "failed" | "missing";
    readonly requirementIds: readonly string[];
    readonly acceptanceCriterionIds: readonly string[];
    readonly traceabilityFound: boolean;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly findings: readonly ReviewFindingDraft[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const findings: ReviewFindingDraft[] = [];
  const tasks = input.task === undefined ? input.taskGraph.tasks : [input.task];
  const requirementIds = tasks.flatMap((task) => task.requirementIds);
  const acceptanceCriterionIds = tasks.flatMap((task) => task.acceptanceCriterionIds);
  const specRequirements = new Set(input.spec?.requirements.map((requirement) => requirement.id) ?? []);
  const specCriteria = new Set(input.spec?.acceptanceCriteria.map((criterion) => criterion.id) ?? []);
  const tracedTasks = new Set(input.traceability?.entries.flatMap((entry) => entry.taskIds) ?? []);

  if (input.spec === undefined) {
    warnings.push("Spec artifact is missing; requirement references could not be fully checked.");
  }

  if (input.traceability === undefined) {
    warnings.push("Traceability artifact is missing.");
  }

  for (const task of tasks) {
    if (task.requirementIds.length === 0) {
      const message = `${task.id} has no requirement mapping.`;
      errors.push(message);
      findings.push(
        finding({
          category: "traceability",
          severity: "error",
          title: "Task has no requirement mapping",
          description: "The task is not traceable to a requirement.",
          evidence: message,
          recommendation: "Map the task to at least one requirement before review.",
          relatedTaskId: task.id
        })
      );
    }

    if (task.acceptanceCriterionIds.length === 0 && taskLooksBehaviorChanging(task)) {
      const message = `${task.id} has no acceptance criterion mapping.`;
      warnings.push(message);
      findings.push(
        finding({
          category: "traceability",
          severity: "warning",
          title: "Behavior task has no acceptance criteria",
          description: "The task appears behavior-changing but has no acceptance criterion IDs.",
          evidence: message,
          recommendation: "Map acceptance criteria or document why validation is manual/static.",
          relatedTaskId: task.id,
          relatedRequirementIds: task.requirementIds
        })
      );
    }

    if (input.traceability !== undefined && !tracedTasks.has(task.id)) {
      const message = `${task.id} is missing from traceability.`;
      errors.push(message);
      findings.push(
        finding({
          category: "traceability",
          severity: "error",
          title: "Task missing from traceability",
          description: "Traceability does not include the reviewed task.",
          evidence: message,
          recommendation: "Regenerate or repair traceability before proceeding.",
          relatedTaskId: task.id,
          relatedRequirementIds: task.requirementIds,
          relatedAcceptanceCriterionIds: task.acceptanceCriterionIds
        })
      );
    }

    if (input.spec !== undefined) {
      for (const requirementId of task.requirementIds) {
        if (!specRequirements.has(requirementId)) {
          errors.push(`${task.id} references missing requirement ${requirementId}.`);
        }
      }

      for (const criterionId of task.acceptanceCriterionIds) {
        if (!specCriteria.has(criterionId)) {
          errors.push(`${task.id} references missing acceptance criterion ${criterionId}.`);
        }
      }
    }
  }

  for (const error of errors.filter((item) => item.includes("references missing"))) {
    findings.push(
      finding({
        category: "traceability",
        severity: "error",
        title: "Traceability reference is invalid",
        description: "A task references a requirement or acceptance criterion that does not exist.",
        evidence: error,
        recommendation: "Fix the task graph or regenerate spec/task artifacts."
      })
    );
  }

  return {
    traceabilityReview: {
      status:
        errors.length > 0
          ? "failed"
          : input.traceability === undefined ? "missing"
          : warnings.length > 0 ? "warnings" : "passed",
      requirementIds: [...new Set(requirementIds)].sort(),
      acceptanceCriterionIds: [...new Set(acceptanceCriterionIds)].sort(),
      traceabilityFound: input.traceability !== undefined,
      warnings,
      errors
    },
    findings
  };
}
