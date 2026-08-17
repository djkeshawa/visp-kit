import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";

/**
 * A context pack embeds the task it was compiled from. When the graph copy and
 * the pack copy disagree, the task was re-scoped mid-flight and the pack has to
 * be regenerated.
 *
 * `status` and `statusBasis` are excluded from that comparison on purpose. Both
 * are workflow progress rather than scope, and the workflow writes them itself:
 * reconcile writes `verified` and the basis behind it at the end of
 * `visp-kit done`. Comparing them made every finished task's pack permanently
 * stale, so `visp-kit next` answered `visp-kit context <id> --force` for a task
 * that was already complete — one more way for the loop to have no ending
 * (found while fixing LC-107, and again when LC-130 added the basis).
 */
function scopeOf(task: Task): Omit<Task, "status" | "statusBasis"> {
  const { status: _status, statusBasis: _statusBasis, ...scope } = task;
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
