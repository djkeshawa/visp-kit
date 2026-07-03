import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { duplicateIds, validation } from "./validation-helpers.js";
import { type WorkflowValidation } from "../workflows/shared/workflow-summary.js";

function hasCycle(graph: Map<string, readonly string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;

    visiting.add(id);

    for (const dependency of graph.get(id) ?? []) {
      if (visit(dependency)) return true;
    }

    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return [...graph.keys()].some(visit);
}

export function validateTaskGraph(input: {
  readonly taskGraph: TaskGraphArtifact;
  readonly spec: SpecArtifact;
  readonly traceability?: TraceabilityMatrix;
}): WorkflowValidation {
  const taskIds = input.taskGraph.tasks.map((task) => task.id);
  const taskSet = new Set(taskIds);
  const requirementSet = new Set(input.spec.requirements.map((requirement) => requirement.id));
  const criterionSet = new Set(input.spec.acceptanceCriteria.map((criterion) => criterion.id));
  const graph = new Map(input.taskGraph.tasks.map((task) => [task.id, task.dependsOn] as const));
  const errors: string[] = [...duplicateIds(taskIds, "task")];

  if (input.taskGraph.tasks.length === 0) {
    errors.push("Task graph must include at least one task.");
  }

  for (const task of input.taskGraph.tasks) {
    if (!/^T\d{3}$/.test(task.id)) {
      errors.push(`${task.id} must use T### format.`);
    }

    for (const dependency of task.dependsOn) {
      if (!taskSet.has(dependency)) {
        errors.push(`${task.id} depends on missing task ${dependency}.`);
      }
    }

    if (task.requirementIds.length === 0) {
      errors.push(`${task.id} must reference at least one requirement.`);
    }

    for (const requirementId of task.requirementIds) {
      if (!requirementSet.has(requirementId)) {
        errors.push(`${task.id} references missing requirement ${requirementId}.`);
      }
    }

    for (const criterionId of task.acceptanceCriterionIds) {
      if (!criterionSet.has(criterionId)) {
        errors.push(`${task.id} references missing acceptance criterion ${criterionId}.`);
      }
    }
  }

  if (hasCycle(graph)) {
    errors.push("Task graph contains a circular dependency.");
  }

  if (input.traceability !== undefined) {
    const tracedTasks = new Set(input.traceability.entries.flatMap((entry) => entry.taskIds));

    for (const taskId of taskIds) {
      if (!tracedTasks.has(taskId)) {
        errors.push(`Traceability is missing task ${taskId}.`);
      }
    }
  }

  return validation(errors);
}
