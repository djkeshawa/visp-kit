import { type ProjectState } from "../../orchestrator/project-state.js";
import {
  ran,
  skipped,
  type EvaluationCheckDraft,
  type EvaluationInspection
} from "../evaluation-coverage.js";

const behaviorTitle = /add|update|create|delete|validate|calculate|workflow/i;

/**
 * Whether every task in the graph maps to a requirement, and whether a task
 * whose title reads like a behaviour change carries acceptance criteria.
 *
 * Skipped rather than silently passing when there is no task graph: an absent
 * graph means the traceability question was never asked, which is not the same
 * answer as "traceability is fine".
 */
export function traceabilityChecks(state: ProjectState): EvaluationInspection {
  const taskGraph = state.taskGraph;

  if (taskGraph === undefined) {
    return skipped("task traceability", "no task graph artifact is available");
  }

  const featurePath = state.selectedFeature?.relativePath ?? null;

  return ran(
    "task traceability",
    taskGraph.tasks.flatMap((task): readonly EvaluationCheckDraft[] => {
      const findings: EvaluationCheckDraft[] = [];

      if (task.requirementIds.length === 0) {
        findings.push({
          category: "traceability",
          severity: "error",
          title: "Task has no requirement mapping",
          description: `${task.id} is not mapped to any requirement.`,
          recommendation: "Regenerate or repair the task graph.",
          file: featurePath,
          taskId: task.id
        });
      }

      if (task.acceptanceCriterionIds.length === 0 && behaviorTitle.test(task.title)) {
        findings.push({
          category: "traceability",
          severity: "warning",
          title: "Behavior task has no acceptance criteria",
          description: `${task.id} appears to change behavior but has no acceptance criterion mapping.`,
          recommendation: "Add acceptance criterion IDs to the task graph.",
          file: featurePath,
          taskId: task.id
        });
      }

      return findings;
    })
  );
}
