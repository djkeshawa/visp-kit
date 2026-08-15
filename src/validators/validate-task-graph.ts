import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { duplicateIds, validation } from "./validation-helpers.js";
import { type WorkflowValidation } from "../workflows/shared/workflow-summary.js";
import {
  concreteText,
  hasConcreteCommand,
  hasConcretePath,
  placeholderFindings
} from "./semantic-lint.js";

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
  /**
   * Tasks that name no requirement the spec declares. Their traceability is a
   * consequence of that, not a second defect: an entry can only exist for a
   * requirement that exists, and telling the author to add one anyway produced
   * a traceability entry for a phantom requirement while the real error stood.
   */
  const unanchoredTasks = new Set<string>();

  if (input.taskGraph.status !== undefined && input.taskGraph.status !== "ready") {
    errors.push("Task graph must be marked ready before workflow advancement.");
  }
  errors.push(...placeholderFindings(input.taskGraph, "taskGraph"));

  if (input.taskGraph.tasks.length === 0) {
    errors.push("Task graph must include at least one task.");
  }

  for (const task of input.taskGraph.tasks) {
    errors.push(...concreteText({ value: task.title, label: `${task.id} title` }));
    errors.push(...concreteText({ value: task.description, label: `${task.id} description` }));
    if (!/^T\d{3}$/.test(task.id)) {
      errors.push(`${task.id} must use T### format.`);
    }

    for (const dependency of task.dependsOn) {
      if (!taskSet.has(dependency)) {
        errors.push(`${task.id} depends on missing task ${dependency}.`);
      }
    }

    if (task.requirementIds.length === 0) {
      unanchoredTasks.add(task.id);
      errors.push(`${task.id} must reference at least one requirement.`);
    }

    if (!hasConcretePath([...(task.allowedFiles ?? []), ...(task.expectedFiles ?? [])])) {
      errors.push(`${task.id} must declare at least one concrete allowed or expected file.`);
    }

    if (!hasConcreteCommand(task.validationCommands)) {
      errors.push(`${task.id} must declare at least one concrete validation command.`);
    }

    if (task.taskClass === undefined) {
      errors.push(`${task.id} must declare taskClass before the task graph is ready.`);
    }

    if (task.riskFactors === undefined) {
      errors.push(`${task.id} must declare riskFactors before the task graph is ready.`);
    }

    for (const requirementId of task.requirementIds) {
      if (!requirementSet.has(requirementId)) {
        unanchoredTasks.add(task.id);

        errors.push(
          `${task.id} references requirement ${requirementId}, which spec.json does not declare.\n` +
            `  Either correct ${task.id}.requirementIds in task-graph.json, or add the requirement to "requirements" in spec.json:\n` +
            `  ${JSON.stringify({
              id: requirementId,
              featureId: input.spec.featureId,
              title: `TBD — name the capability ${requirementId} requires.`,
              description: `TBD — state what the system must do for ${requirementId}.`,
              source: "user",
              priority: "must",
              acceptanceCriteria: [],
              assumptions: [],
              outOfScope: []
            })}`
        );
      }
    }

    // The spec states criteria in two mirrored places, so "missing" means
    // absent from both. Naming the requirement to attach it to, and the shape
    // it has to take, turns a lookup across two files into a one-block edit.
    //
    // The fragment's prose is deliberately a placeholder Kit itself refuses.
    // Filler that reads like real prose survives: pasting it once satisfies
    // this error, `spec --validate` then passes, and the spec keeps an
    // acceptance criterion that asserts nothing. "TBD" fails the next gate
    // until a human states the outcome.
    for (const criterionId of task.acceptanceCriterionIds) {
      if (!criterionSet.has(criterionId)) {
        const requirementId =
          task.requirementIds.find((id) => requirementSet.has(id)) ??
          task.requirementIds[0] ??
          "REQ001";

        errors.push(
          `${task.id} references acceptance criterion ${criterionId}, which spec.json does not declare.\n` +
            `  Add it to the acceptanceCriteria of ${requirementId} in spec.json:\n` +
            `  ${JSON.stringify({
              id: criterionId,
              requirementId,
              description: `TBD — state the observable outcome that proves ${requirementId} is met.`,
              testable: true,
              validationMethod: "unit"
            })}`
        );
      }
    }
  }

  if (hasCycle(graph)) {
    errors.push("Task graph contains a circular dependency.");
  }

  if (input.traceability !== undefined) {
    const tracedTasks = new Set(input.traceability.entries.flatMap((entry) => entry.taskIds));
    const missingTasks = input.taskGraph.tasks.filter(
      (task) => !tracedTasks.has(task.id) && !unanchoredTasks.has(task.id)
    );

    // A task belongs in the entry for each requirement it implements, and the
    // task already names those requirements. Naming the exact entries turns a
    // "go read two files and work out the correspondence" failure into a
    // one-line edit.
    if (missingTasks.length > 0) {
      const repairs = missingTasks
        .map((task) => `  ${task.id}: add to the taskIds of ${task.requirementIds.join(", ")}`)
        .join("\n");

      errors.push(
        `Traceability is missing ${missingTasks.map((task) => task.id).join(", ")}.\n${repairs}`
      );
    }
  }

  return validation(errors);
}
