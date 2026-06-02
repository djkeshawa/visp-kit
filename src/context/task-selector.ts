import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

function availableTaskMessage(tasks: readonly Task[]): string {
  const ids = tasks.map((task) => task.id).join(", ");
  return ids.length === 0 ? "No tasks are available." : `Available task IDs: ${ids}.`;
}

export function selectTaskById(
  taskGraph: TaskGraphArtifact,
  taskId: string
): Result<Task, VispError> {
  const task = taskGraph.tasks.find((candidate) => candidate.id === taskId);

  if (task !== undefined) {
    return ok(task);
  }

  return err(
    new VispError(
      "VALIDATION_FAILED",
      `Task not found: ${taskId}. ${availableTaskMessage(taskGraph.tasks)}`
    )
  );
}

function completedTaskIds(tasks: readonly Task[]): Set<string> {
  return new Set(
    tasks
      .filter((task) => task.status === "done" || task.status === "verified")
      .map((task) => task.id)
  );
}

function dependenciesResolved(task: Task, done: Set<string>): boolean {
  return task.dependsOn.every((dependency) => done.has(dependency));
}

export function selectNextTask(
  taskGraph: TaskGraphArtifact
): Result<Task, VispError> {
  const ready = taskGraph.tasks.find((task) => task.status === "ready");

  if (ready !== undefined) {
    return ok(ready);
  }

  const done = completedTaskIds(taskGraph.tasks);
  const resolvedPending = taskGraph.tasks.find(
    (task) => task.status === "pending" && dependenciesResolved(task, done)
  );

  if (resolvedPending !== undefined) {
    return ok(resolvedPending);
  }

  const dependencyFreePending = taskGraph.tasks.find(
    (task) => task.status === "pending" && task.dependsOn.length === 0
  );

  if (dependencyFreePending !== undefined) {
    return ok(dependencyFreePending);
  }

  return err(
    new VispError(
      "VALIDATION_FAILED",
      "No suitable next task found. Mark a task ready or complete dependencies first."
    )
  );
}

export function validateTaskDependencies(
  taskGraph: TaskGraphArtifact,
  selectedTask: Task
): readonly string[] {
  const taskIds = new Set(taskGraph.tasks.map((task) => task.id));

  return selectedTask.dependsOn
    .filter((dependency) => !taskIds.has(dependency))
    .map((dependency) => `${selectedTask.id} depends on missing task ${dependency}.`);
}
