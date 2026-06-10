import {
  budgetArtifactPath,
  clarificationsArtifactPath,
  contextPackArtifactPath,
  featureTimelineArtifactPath,
  featureTimelineMarkdownPath,
  planArtifactPath,
  runIndexArtifactPath,
  specArtifactPath,
  taskGraphArtifactPath,
  taskReconcileArtifactPath,
  taskReviewArtifactPath,
  verificationArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { budgetArtifactSchema } from "../artifacts/schemas/budget.schema.js";
import {
  featureTimelineSchema,
  type FeatureTimeline,
  type TimelineEvent
} from "../artifacts/schemas/timeline.schema.js";
import { runIndexSchema } from "../artifacts/schemas/run.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { loadProjectState } from "../orchestrator/project-state.js";
import { renderTimelineMarkdown } from "./timeline-report.js";

async function exists(filePath: string): Promise<boolean> {
  const result = await pathExists(filePath);
  return result.ok && result.value;
}

function event(input: Omit<TimelineEvent, "id">, index: number): TimelineEvent {
  return {
    id: `TLE${String(index + 1).padStart(3, "0")}`,
    ...input
  };
}

async function latestRunEvents(input: {
  readonly targetPath: string;
  readonly featureId: string;
  readonly featureSlug: string;
}): Promise<readonly Omit<TimelineEvent, "id">[]> {
  if (!(await exists(runIndexArtifactPath(input.targetPath)))) return [];

  const index = await readArtifact(runIndexArtifactPath(input.targetPath), runIndexSchema, {
    artifactName: "run index"
  });

  if (!index.ok) return [];

  return index.value.runs
    .filter((run) =>
      run.featureId === input.featureId || run.featureSlug === input.featureSlug
    )
    .slice(-20)
    .map((run) => ({
      kind: "run" as const,
      title: run.command,
      status: run.result,
      taskId: run.taskId,
      path: run.runPath,
      createdAt: run.endedAt
    }));
}

async function budgetTotals(input: {
  readonly targetPath: string;
  readonly featureId: string;
}): Promise<{ readonly actualTokens?: number }> {
  if (!(await exists(budgetArtifactPath(input.targetPath)))) return {};

  const budget = await readArtifact(budgetArtifactPath(input.targetPath), budgetArtifactSchema, {
    artifactName: "budget"
  });

  if (!budget.ok) return {};

  const actualTokens = (budget.value.usage ?? [])
    .filter((usage) => usage.featureId === input.featureId)
    .reduce((total, usage) => total + (usage.totalTokens ?? 0), 0);

  return actualTokens > 0 ? { actualTokens } : {};
}

export async function buildFeatureTimeline(input: {
  readonly targetPath: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly now: string;
}): Promise<Result<FeatureTimeline, VispError>> {
  const state = await loadProjectState({
    targetPath: input.targetPath,
    feature: input.feature,
    taskId: input.taskId
  });

  if (!state.ok) return state;
  if (state.value.selectedFeature === undefined) {
    return ok({
      featureId: "unknown",
      featureSlug: "unknown",
      generatedAt: input.now,
      taskCount: 0,
      completedTaskCount: 0,
      openBlockers: ["No active feature is selected."],
      events: []
    });
  }

  const feature = state.value.selectedFeature;
  const featureKey = feature.key;
  const events: Array<Omit<TimelineEvent, "id">> = [
    {
      kind: "artifact",
      title: "Feature intent",
      status: state.value.selectedFeature.intent === undefined ? "missing" : "ready",
      path: `.visp/features/${featureKey}/intent.json`
    },
    {
      kind: "artifact",
      title: "Clarifications",
      status: await exists(clarificationsArtifactPath(input.targetPath, featureKey)) ? "ready" : "missing",
      path: `.visp/features/${featureKey}/clarifications.json`
    },
    {
      kind: "artifact",
      title: "Specification",
      status: await exists(specArtifactPath(input.targetPath, featureKey)) ? "ready" : "missing",
      path: `.visp/features/${featureKey}/spec.json`
    },
    {
      kind: "artifact",
      title: "Plan",
      status: await exists(planArtifactPath(input.targetPath, featureKey)) ? "ready" : "missing",
      path: `.visp/features/${featureKey}/plan.json`
    },
    {
      kind: "artifact",
      title: "Task graph",
      status: await exists(taskGraphArtifactPath(input.targetPath, featureKey)) ? "ready" : "missing",
      path: `.visp/features/${featureKey}/task-graph.json`
    }
  ];

  for (const task of state.value.taskGraph?.tasks ?? []) {
    events.push({
      kind: "context",
      title: "Context pack",
      status: await exists(contextPackArtifactPath(input.targetPath, featureKey, task.id)) ? "ready" : "missing",
      path: `.visp/features/${featureKey}/context/${task.id}.context.json`,
      taskId: task.id
    });
    events.push({
      kind: "review",
      title: "Review report",
      status: await exists(taskReviewArtifactPath(input.targetPath, featureKey, task.id)) ? "ready" : "missing",
      path: `.visp/features/${featureKey}/review/${task.id}.review.json`,
      taskId: task.id
    });
    events.push({
      kind: "reconcile",
      title: "Reconcile report",
      status: await exists(taskReconcileArtifactPath(input.targetPath, featureKey, task.id)) ? "ready" : "missing",
      path: `.visp/features/${featureKey}/reconcile/${task.id}.reconcile.json`,
      taskId: task.id
    });
  }

  events.push({
    kind: "verification",
    title: "Verification report",
    status: await exists(verificationArtifactPath(input.targetPath, featureKey)) ? "ready" : "missing",
    path: `.visp/features/${featureKey}/verification.json`
  });
  events.push(...await latestRunEvents({
    targetPath: input.targetPath,
    featureId: feature.id,
    featureSlug: feature.slug
  }));

  const budget = await budgetTotals({
    targetPath: input.targetPath,
    featureId: feature.id
  });
  const estimatedTokens = state.value.contextPack?.estimatedTokens.total;
  const blockers = [
    ...state.value.errors,
    ...(state.value.verification?.success === false ? ["Verification failed."] : []),
    ...(state.value.review?.result === "failed" ? ["Review failed."] : []),
    ...(state.value.reconcile?.result === "failed" ? ["Reconciliation failed."] : [])
  ];
  const taskCount = state.value.taskGraph?.tasks.length ?? 0;
  const completedTaskCount = (state.value.taskGraph?.tasks ?? []).filter((task) =>
    task.status === "done" || task.status === "verified"
  ).length;

  return ok({
    featureId: feature.id,
    featureSlug: feature.slug,
    generatedAt: input.now,
    taskCount,
    completedTaskCount,
    estimatedTokens,
    actualTokens: budget.actualTokens,
    openBlockers: blockers,
    events: events.map(event)
  });
}

export async function writeFeatureTimeline(input: {
  readonly targetPath: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly now: string;
  readonly dryRun: boolean;
}): Promise<Result<{
  readonly writtenFiles: readonly string[];
  readonly warnings: readonly string[];
}, VispError>> {
  const timeline = await buildFeatureTimeline(input);

  if (!timeline.ok) return timeline;
  if (timeline.value.featureId === "unknown") {
    return ok({ writtenFiles: [], warnings: timeline.value.openBlockers });
  }

  const featureKey = `${timeline.value.featureId}-${timeline.value.featureSlug}`;
  const jsonPath = featureTimelineArtifactPath(input.targetPath, featureKey);
  const markdownPath = featureTimelineMarkdownPath(input.targetPath, featureKey);

  if (input.dryRun) return ok({ writtenFiles: [], warnings: [] });

  const jsonWrite = await writeArtifact(jsonPath, featureTimelineSchema, timeline.value, {
    artifactName: "feature timeline"
  });

  if (!jsonWrite.ok) return jsonWrite;

  const markdownWrite = await writeTextFile(markdownPath, renderTimelineMarkdown(timeline.value));

  if (!markdownWrite.ok) return markdownWrite;

  return ok({
    writtenFiles: [
      relativePath(input.targetPath, jsonPath),
      relativePath(input.targetPath, markdownPath)
    ],
    warnings: []
  });
}
