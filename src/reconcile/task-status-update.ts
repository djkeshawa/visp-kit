import {
  type ReconcileResult,
  type TaskStatusUpdate
} from "../artifacts/schemas/reconcile.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";

/**
 * Decides whether reconciliation may move the selected task's status, and
 * records the reason when it may not.
 *
 * Split out of `reconcile.workflow.ts` rather than added to it: the workflow is
 * already far past the length this repository asks for, and the decision is
 * worth reading and testing on its own. The write itself stays in the workflow,
 * which owns artifact IO.
 */
export function planTaskStatusUpdate(input: {
  readonly requested: boolean;
  readonly promptOnly: boolean;
  readonly dryRun: boolean;
  readonly task?: Task;
  readonly result: ReconcileResult;
  /**
   * `--force` on the standalone command: the caller's explicit consent to close
   * a task whose reconciliation reported warnings.
   */
  readonly force: boolean;
  /**
   * `visp-kit done` sets this instead of `force`. Its pipeline already accepted
   * warnings at verify, review and reconcile, so refusing to close the task on
   * the same warnings would leave the documented loop with no ending — the very
   * defect this exists to fix. Unlike `force` it grants nothing else: the policy
   * gate is untouched, and a failed reconciliation still blocks.
   */
  readonly closeOnWarnings: boolean;
  readonly verificationPassed: boolean;
}): TaskStatusUpdate {
  const taskId = input.task?.id ?? null;
  const previousStatus = input.task?.status ?? null;
  const skipped = (skippedReason: string): TaskStatusUpdate => ({
    requested: input.requested,
    performed: false,
    taskId,
    previousStatus,
    newStatus: null,
    skippedReason
  });

  if (!input.requested) return skipped("not requested");
  if (input.task === undefined) return skipped("no task selected");
  if (input.promptOnly) return skipped("prompt-only mode");
  if (input.result === "failed") return skipped("reconciliation has blocking errors");

  if (input.result === "warnings" && !input.force && !input.closeOnWarnings) {
    return skipped("reconciliation reported warnings; rerun with --force to accept them");
  }

  const newStatus = input.verificationPassed ? "verified" : "done";

  if (input.dryRun) {
    return {
      requested: true,
      performed: false,
      taskId,
      previousStatus,
      newStatus,
      skippedReason: "dry-run"
    };
  }

  return {
    requested: true,
    performed: true,
    taskId,
    previousStatus,
    newStatus,
    skippedReason: null
  };
}

export function describeTaskStatusUpdate(update: TaskStatusUpdate): string {
  if (update.performed) {
    return `${update.taskId ?? "task"}: ${update.previousStatus ?? "unknown"} -> ${
      update.newStatus ?? "unknown"
    }`;
  }

  return `not updated (${update.skippedReason ?? "unknown reason"})`;
}
