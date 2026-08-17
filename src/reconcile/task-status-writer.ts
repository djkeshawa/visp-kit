import { taskGraphArtifactPath, tasksMarkdownPath } from "../artifacts/artifact-paths.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { type TaskStatusUpdate } from "../artifacts/schemas/reconcile.schema.js";
import { type ReviewReport } from "../artifacts/schemas/review.schema.js";
import {
  taskGraphArtifactSchema,
  type Task,
  type TaskGraphArtifact,
  type TaskStatusBasis
} from "../artifacts/schemas/task.schema.js";
import { type TaskStatus } from "../artifacts/schemas/common.schema.js";
import { type VispError } from "../core/errors.js";
import { writeTextFile } from "../core/file-system.js";
import { ok, type Result } from "../core/result.js";
import { renderTasksMarkdownFromArtifact } from "../templates/phase7-templates.js";
import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import { type TaskStatusUpdatePlan } from "./task-status-update.js";

/**
 * What the status transition was decided on, recorded onto the task itself.
 *
 * LC-130: `verified` was durable and basis-free. Anyone reading the task graph
 * afterwards — a later gate, a reviewer, a claim about assurance — saw a status
 * and had no way to ask what it was measured against.
 */
export function taskStatusBasis(input: {
  readonly status: TaskStatus;
  readonly recordedAt: string;
  readonly review?: ReviewReport;
  readonly verificationPassed: boolean;
}): TaskStatusBasis {
  const review = input.review;

  return {
    status: input.status,
    recordedAt: input.recordedAt,
    review:
      review === undefined
        ? null
        : {
            result: review.result,
            basis: review.scopeBasis?.description ?? "Basis not recorded by this review.",
            filesExamined: review.scopeBasis?.filesExamined ?? review.changedFiles.length,
            reviewableFiles: review.scopeBasis?.reviewableFiles.length ?? 0,
            reviewedExpectedFiles: [...(review.scopeReview.reviewedExpectedFiles ?? [])]
          },
    verificationPassed: input.verificationPassed
  };
}

/**
 * Writes the task's new status and its basis, then reports what happened.
 *
 * The write runs before the reconciliation report is built. Before LC-130 the
 * report was serialised with `taskStatusUpdate.performed: true` and the write
 * happened afterwards, so a failed write left an evidence artifact asserting a
 * transition that never occurred. The plan says what is intended; only this
 * function may say it was performed.
 */
export async function applyTaskStatusUpdate(input: {
  readonly plan: TaskStatusUpdatePlan;
  readonly targetPath: string;
  readonly feature: ActiveFeature;
  readonly featureKey: string;
  readonly taskGraph: TaskGraphArtifact;
  readonly task?: Task;
  readonly review?: ReviewReport;
  readonly verificationPassed: boolean;
  readonly now: string;
}): Promise<Result<TaskStatusUpdate, VispError>> {
  const plan = input.plan;

  if (plan.kind === "skip") return ok(plan.update);
  if (input.task === undefined) {
    return ok({
      requested: true,
      performed: false,
      taskId: plan.taskId,
      previousStatus: plan.previousStatus,
      newStatus: plan.newStatus,
      skippedReason: "no task selected"
    });
  }

  const basis = taskStatusBasis({
    status: plan.newStatus,
    recordedAt: input.now,
    ...(input.review === undefined ? {} : { review: input.review }),
    verificationPassed: input.verificationPassed
  });
  const nextGraph: TaskGraphArtifact = {
    ...input.taskGraph,
    tasks: input.taskGraph.tasks.map((task) =>
      task.id === plan.taskId ? { ...task, status: plan.newStatus, statusBasis: basis } : task
    ),
    updatedAt: input.now
  };
  const write = await writeArtifact(
    taskGraphArtifactPath(input.targetPath, input.featureKey),
    taskGraphArtifactSchema,
    nextGraph,
    { artifactName: "task graph" }
  );

  if (!write.ok) return write;

  // tasks.md is a derived view of task-graph.json. Rewriting the graph without
  // re-rendering the markdown desynchronizes the pair on the very next command
  // after `visp-kit tasks --validate` synchronized it.
  const writeMarkdown = await writeTextFile(
    tasksMarkdownPath(input.targetPath, input.featureKey),
    renderTasksMarkdownFromArtifact({ feature: input.feature, artifact: nextGraph })
  );

  if (!writeMarkdown.ok) return writeMarkdown;

  return ok({
    requested: true,
    performed: true,
    taskId: plan.taskId,
    previousStatus: plan.previousStatus,
    newStatus: plan.newStatus,
    skippedReason: null
  });
}
