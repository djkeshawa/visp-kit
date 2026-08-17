import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";

/**
 * A context pack embeds the task it was compiled from. When the graph copy and
 * the pack copy disagree, the task was re-scoped mid-flight and the pack has to
 * be regenerated.
 *
 * `status` is excluded from that comparison on purpose. It is workflow
 * progress, not scope, and the workflow moves it itself: reconcile writes
 * `verified` at the end of `visp-kit done`. Comparing it made every finished
 * task's pack permanently stale, so `visp-kit next` answered
 * `visp-kit context <id> --force` for a task that was already complete — one
 * more way for the loop to have no ending (found while fixing LC-107).
 */
function scopeOf(task: Task): Omit<Task, "status"> {
  const { status: _status, ...scope } = task;
  return scope;
}

export function contextPackIsStale(input: {
  readonly contextPack: ContextPack | undefined;
  readonly task: Task | undefined;
}): boolean {
  if (input.contextPack === undefined || input.task === undefined) return false;
  if (input.contextPack.taskId !== input.task.id) return false;

  return (
    JSON.stringify(scopeOf(input.contextPack.selectedTask)) !== JSON.stringify(scopeOf(input.task))
  );
}
