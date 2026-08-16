import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { type TraceabilityValidationSection } from "../artifacts/schemas/verification.schema.js";
import { untracedTaskErrors } from "../validators/traceability-repair.js";

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

  const untracedGraphTasks = input.taskGraph.tasks.filter((task) => !tracedTasks.has(task.id));

  // Same repair the task-graph validator prints, from the same helper, so the
  // two stages cannot drift into describing one defect two ways.
  errors.push(
    ...untracedTaskErrors({
      untracedTasks: untracedGraphTasks,
      traceability: input.traceability,
      ...(input.spec === undefined ? {} : { spec: input.spec })
    })
  );

  for (const task of input.taskGraph.tasks) {
    // A task naming no requirement has no entry to be pointed at; the repair is
    // to give it one, which is the error immediately below.
    if (!tracedTasks.has(task.id) && task.requirementIds.length === 0) {
      errors.push(`Traceability is missing task ${task.id}.`);
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

  const selectedTask = input.task;

  if (selectedTask !== undefined) {
    if (selectedTask.requirementIds.length === 0) {
      errors.push(`${selectedTask.id} must map to at least one requirement.`);
    }

    if (selectedTask.acceptanceCriterionIds.length === 0) {
      warnings.push(
        `${selectedTask.id} has no acceptance criterion mapping; behavior-changing tasks should map criteria.`
      );
    }

    // The selected task gets its own error naming itself first, because the
    // reader asked about this one task.
    //
    // It does NOT repeat the repair. The selected task is a member of the task
    // graph, so the sweep above already printed a repair covering it, and
    // printing a second copy here put the same `Append to "entries"` JSON on
    // screen twice — a reader who copied the whole verify output wrote the entry
    // twice and got a `traceability.json` with duplicate entries for one
    // requirement. `untracedTaskErrors` speaks only for tasks that name a
    // requirement, so a task with none is still owed its own repair-free line.
    if (!tracedTasks.has(selectedTask.id)) {
      const coveredBySweep =
        selectedTask.requirementIds.length > 0 &&
        untracedGraphTasks.some((task) => task.id === selectedTask.id);

      if (coveredBySweep) {
        errors.push(
          `${selectedTask.id} is missing from traceability.json. ` +
            `The traceability.json repair above already covers ${selectedTask.id}; apply it once.`
        );
      } else {
        const repairs = untracedTaskErrors({
          untracedTasks: [selectedTask],
          traceability: input.traceability,
          ...(input.spec === undefined ? {} : { spec: input.spec })
        });

        errors.push(
          repairs.length > 0
            ? `${selectedTask.id} is missing from traceability.json.\n${repairs.join("\n")}`
            : `${selectedTask.id} is missing from traceability.json.`
        );
      }
    }
  }

  return {
    status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warned" : "passed",
    checkedTaskId: input.task?.id ?? null,
    warnings,
    errors
  };
}
