import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { type TraceabilityValidationSection } from "../artifacts/schemas/verification.schema.js";

function duplicates(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }

  return [...duplicate].map((value) => `Duplicate ${label} ID: ${value}.`);
}

export function validateTraceability(input: {
  readonly taskGraph: TaskGraphArtifact;
  readonly task?: Task;
  readonly spec?: SpecArtifact;
  readonly traceability?: TraceabilityMatrix;
  readonly explicit: boolean;
}): TraceabilityValidationSection {
  const errors: string[] = [];
  const warnings: string[] = [];
  const taskIds = input.taskGraph.tasks.map((task) => task.id);

  errors.push(...duplicates(taskIds, "task"));

  for (const task of input.taskGraph.tasks) {
    for (const dependency of task.dependsOn) {
      if (!taskIds.includes(dependency)) {
        errors.push(`${task.id} depends on missing task ${dependency}.`);
      }
    }
  }

  if (input.spec === undefined) {
    warnings.push("Spec artifact is missing; deep traceability could not be verified.");
  }

  if (input.traceability === undefined) {
    const message = "Traceability artifact is missing.";

    if (input.explicit) {
      errors.push(message);
    } else {
      warnings.push(message);
    }

    return {
      status: errors.length > 0 ? "failed" : "warned",
      checkedTaskId: input.task?.id ?? null,
      warnings,
      errors
    };
  }

  const requirements = new Set(input.spec?.requirements.map((requirement) => requirement.id) ?? []);
  const criteria = new Set(input.spec?.acceptanceCriteria.map((criterion) => criterion.id) ?? []);
  const tracedRequirements = new Set(
    input.traceability.entries.map((entry) => entry.requirementId)
  );
  const tracedCriteria = new Set(
    input.traceability.entries.flatMap((entry) => entry.acceptanceCriterionIds)
  );
  const tracedTasks = new Set(input.traceability.entries.flatMap((entry) => entry.taskIds));

  if (input.spec !== undefined) {
    errors.push(
      ...duplicates(
        input.spec.requirements.map((requirement) => requirement.id),
        "requirement"
      ),
      ...duplicates(
        input.spec.acceptanceCriteria.map((criterion) => criterion.id),
        "acceptance criterion"
      )
    );

    // These used to be bare one-liners ("Traceability is missing requirement
    // REQ002.") while the spec and task-graph validators print the exact
    // repair. A weak-model evaluation hit the bare form at the verify stage,
    // decided the tool was misconfigured, and finished the work outside the
    // workflow — the message, not the check, was what failed. Same class of
    // gap, same repair guidance as validate-spec.
    const missingRequirements = input.spec.requirements.filter(
      (requirement) => !tracedRequirements.has(requirement.id)
    );
    if (missingRequirements.length > 0) {
      const spec = input.spec;
      const additions = missingRequirements.map((requirement) => ({
        requirementId: requirement.id,
        acceptanceCriterionIds: spec.acceptanceCriteria
          .filter((criterion) => criterion.requirementId === requirement.id)
          .map((criterion) => criterion.id),
        taskIds: [],
        filePaths: [],
        testPaths: [],
        status: "missing"
      }));
      errors.push(
        `Traceability is missing ${missingRequirements.map((r) => r.id).join(", ")}. ` +
          `Append to "entries" in traceability.json:\n${JSON.stringify(additions, null, 2)}`
      );
    }

    const orphanedCriteria = input.spec.acceptanceCriteria.filter(
      (criterion) =>
        !tracedCriteria.has(criterion.id) && tracedRequirements.has(criterion.requirementId)
    );
    if (orphanedCriteria.length > 0) {
      const repairs = orphanedCriteria
        .map(
          (criterion) =>
            `  ${criterion.requirementId}: add ${criterion.id} to its acceptanceCriterionIds`
        )
        .join("\n");
      errors.push(
        `Traceability is missing acceptance criteria ${orphanedCriteria
          .map((criterion) => criterion.id)
          .join(", ")}.\n${repairs}`
      );
    }

    for (const criterion of input.spec.acceptanceCriteria) {
      if (!requirements.has(criterion.requirementId)) {
        errors.push(`${criterion.id} references missing requirement ${criterion.requirementId}.`);
      }
    }
  }

  for (const entry of input.traceability.entries) {
    if (input.spec !== undefined && !requirements.has(entry.requirementId)) {
      errors.push(`Traceability references missing requirement ${entry.requirementId}.`);
    }

    for (const criterionId of entry.acceptanceCriterionIds) {
      if (input.spec !== undefined && !criteria.has(criterionId)) {
        errors.push(`Traceability references missing acceptance criterion ${criterionId}.`);
      }
    }

    for (const taskId of entry.taskIds) {
      if (!taskIds.includes(taskId)) {
        errors.push(`Traceability references missing task ${taskId}.`);
      }
    }
  }

  for (const task of input.taskGraph.tasks) {
    if (!tracedTasks.has(task.id)) {
      // Same repair the task-graph validator prints: the task already names
      // its requirements, so say exactly which entries to extend.
      const repair =
        task.requirementIds.length > 0
          ? ` Add ${task.id} to the taskIds of ${task.requirementIds.join(", ")} in traceability.json.`
          : "";
      errors.push(`Traceability is missing task ${task.id}.${repair}`);
    }

    if (input.spec !== undefined) {
      if (task.requirementIds.length === 0) {
        errors.push(`${task.id} must reference at least one requirement.`);
      }

      for (const requirementId of task.requirementIds) {
        if (!requirements.has(requirementId)) {
          errors.push(`${task.id} references missing requirement ${requirementId}.`);
        }
      }

      for (const criterionId of task.acceptanceCriterionIds) {
        if (!criteria.has(criterionId)) {
          errors.push(`${task.id} references missing acceptance criterion ${criterionId}.`);
        }
      }
    }
  }

  if (input.task !== undefined) {
    if (input.task.requirementIds.length === 0) {
      errors.push(`${input.task.id} must map to at least one requirement.`);
    }

    if (input.task.acceptanceCriterionIds.length === 0) {
      warnings.push(
        `${input.task.id} has no acceptance criterion mapping; behavior-changing tasks should map criteria.`
      );
    }

    if (!tracedTasks.has(input.task.id)) {
      const repair =
        input.task.requirementIds.length > 0
          ? ` Add ${input.task.id} to the taskIds of ${input.task.requirementIds.join(", ")} in traceability.json.`
          : "";
      errors.push(`${input.task.id} is missing from traceability.${repair}`);
    }
  }

  return {
    status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warned" : "passed",
    checkedTaskId: input.task?.id ?? null,
    warnings,
    errors
  };
}
