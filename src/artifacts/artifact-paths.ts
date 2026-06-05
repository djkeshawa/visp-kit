import {
  joinPath,
  vispConfigPath,
  vispDir,
  vispStatusPath
} from "../core/paths.js";

export function projectProfileArtifactPath(rootPath: string): string {
  return joinPath(vispDir(rootPath), "project.json");
}

export function projectConfigArtifactPath(rootPath: string): string {
  return vispConfigPath(rootPath);
}

export function projectStatusArtifactPath(rootPath: string): string {
  return vispStatusPath(rootPath);
}

export function policyArtifactPath(rootPath: string): string {
  return joinPath(vispDir(rootPath), "policy.json");
}

export function overridesArtifactPath(rootPath: string): string {
  return joinPath(vispDir(rootPath), "overrides.json");
}

export function memoryArtifactDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "memory");
}

export function projectSummaryArtifactPath(rootPath: string): string {
  return joinPath(memoryArtifactDir(rootPath), "project-summary.md");
}

export function patternsArtifactPath(rootPath: string): string {
  return joinPath(memoryArtifactDir(rootPath), "patterns.md");
}

export function constitutionMarkdownArtifactPath(rootPath: string): string {
  return joinPath(memoryArtifactDir(rootPath), "constitution.md");
}

export function compactConstitutionArtifactPath(rootPath: string): string {
  return joinPath(memoryArtifactDir(rootPath), "constitution.compact.md");
}

export function constitutionArtifactPath(rootPath: string): string {
  return joinPath(memoryArtifactDir(rootPath), "constitution.json");
}

export function cacheArtifactDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "cache");
}

export function fileIndexArtifactPath(rootPath: string): string {
  return joinPath(cacheArtifactDir(rootPath), "file-index.json");
}

export function fileSummariesArtifactPath(rootPath: string): string {
  return joinPath(cacheArtifactDir(rootPath), "file-summaries.json");
}

export function moduleMapArtifactPath(rootPath: string): string {
  return joinPath(cacheArtifactDir(rootPath), "module-map.json");
}

export function testMapArtifactPath(rootPath: string): string {
  return joinPath(cacheArtifactDir(rootPath), "test-map.json");
}

export function dependencyMapArtifactPath(rootPath: string): string {
  return joinPath(cacheArtifactDir(rootPath), "dependency-map.json");
}

export function scanMetaArtifactPath(rootPath: string): string {
  return joinPath(cacheArtifactDir(rootPath), "scan-meta.json");
}

export function reportsArtifactDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "reports");
}

export function scanReportArtifactPath(rootPath: string): string {
  return joinPath(reportsArtifactDir(rootPath), "scan-report.md");
}

export function budgetReportArtifactPath(rootPath: string): string {
  return joinPath(reportsArtifactDir(rootPath), "budget-report.md");
}

export function statusReportArtifactPath(rootPath: string): string {
  return joinPath(reportsArtifactDir(rootPath), "status-report.md");
}

export function doctorReportArtifactPath(rootPath: string): string {
  return joinPath(reportsArtifactDir(rootPath), "doctor-report.md");
}

export function gateReportArtifactPath(rootPath: string): string {
  return joinPath(reportsArtifactDir(rootPath), "gate-report.md");
}

export function evaluationReportArtifactPath(rootPath: string): string {
  return joinPath(reportsArtifactDir(rootPath), "evaluation-report.json");
}

export function evaluationReportMarkdownPath(rootPath: string): string {
  return joinPath(reportsArtifactDir(rootPath), "evaluation-report.md");
}

export function runsArtifactDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "runs");
}

export function runIndexArtifactPath(rootPath: string): string {
  return joinPath(runsArtifactDir(rootPath), "index.json");
}

export function runArtifactDir(rootPath: string, runId: string): string {
  return joinPath(runsArtifactDir(rootPath), runId);
}

export function runArtifactPath(rootPath: string, runId: string): string {
  return joinPath(runArtifactDir(rootPath, runId), "run.json");
}

export function runMarkdownPath(rootPath: string, runId: string): string {
  return joinPath(runArtifactDir(rootPath, runId), "run.md");
}

export function runEventsPath(rootPath: string, runId: string): string {
  return joinPath(runArtifactDir(rootPath, runId), "events.jsonl");
}

export function workflowManifestArtifactPath(rootPath: string): string {
  return joinPath(vispDir(rootPath), "workflow.json");
}

export function presetsArtifactDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "presets");
}

export function featuresArtifactDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "features");
}

export function featureArtifactDir(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featuresArtifactDir(rootPath), featureKey);
}

export function featureArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "feature.json");
}

export function featureIntentMarkdownPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "intent.md");
}

export function featureIntentArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "intent.json");
}

export function clarificationsMarkdownPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "clarifications.md");
}

export function clarificationsArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "clarifications.json");
}

export function specMarkdownPath(rootPath: string, featureKey: string): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "spec.md");
}

export function specArtifactPath(rootPath: string, featureKey: string): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "spec.json");
}

export function planMarkdownPath(rootPath: string, featureKey: string): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "plan.md");
}

export function tasksMarkdownPath(rootPath: string, featureKey: string): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "tasks.md");
}

export function traceabilityMarkdownPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "traceability.md");
}

export function requirementsArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "requirements.json");
}

export function planArtifactPath(rootPath: string, featureKey: string): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "plan.json");
}

export function taskGraphArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "task-graph.json");
}

export function contextPacksArtifactDir(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "context");
}

export function contextPackArtifactPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(contextPacksArtifactDir(rootPath, featureKey), `${taskId}.context.json`);
}

export function contextPackMarkdownPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(contextPacksArtifactDir(rootPath, featureKey), `${taskId}.context.md`);
}

export function contextPromptPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(contextPacksArtifactDir(rootPath, featureKey), `${taskId}.prompt.md`);
}

export function contextChecklistPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(contextPacksArtifactDir(rootPath, featureKey), `${taskId}.implementation-checklist.md`);
}

export function verificationArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "verification.json");
}

export function verificationMarkdownPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "verification.md");
}

export function featureReviewArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "review.json");
}

export function featureReviewMarkdownPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "review.md");
}

export function reviewArtifactDir(rootPath: string, featureKey: string): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "review");
}

export function taskReviewArtifactPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(reviewArtifactDir(rootPath, featureKey), `${taskId}.review.json`);
}

export function taskReviewMarkdownPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(reviewArtifactDir(rootPath, featureKey), `${taskId}.review.md`);
}

export function taskReviewPromptPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(reviewArtifactDir(rootPath, featureKey), `${taskId}.review-prompt.md`);
}

export function taskReviewChecklistPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(reviewArtifactDir(rootPath, featureKey), `${taskId}.review-checklist.md`);
}

export function featureReviewPromptPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "review-prompt.md");
}

export function featureReviewChecklistPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "review-checklist.md");
}

export function featureReconcileArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "reconcile.json");
}

export function featureReconcileMarkdownPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "reconcile.md");
}

export function reconcileArtifactDir(rootPath: string, featureKey: string): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "reconcile");
}

export function taskReconcileArtifactPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(reconcileArtifactDir(rootPath, featureKey), `${taskId}.reconcile.json`);
}

export function taskReconcileMarkdownPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(reconcileArtifactDir(rootPath, featureKey), `${taskId}.reconcile.md`);
}

export function taskReconcilePromptPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(reconcileArtifactDir(rootPath, featureKey), `${taskId}.reconcile-prompt.md`);
}

export function featureReconcilePromptPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "reconcile-prompt.md");
}

export function featurePrArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "pr.json");
}

export function featurePrMarkdownPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "pr.md");
}

export function traceabilityArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "traceability.json");
}

export function featureTimelineArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "timeline.json");
}

export function featureTimelineMarkdownPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "timeline.md");
}

export function budgetArtifactPath(rootPath: string): string {
  return joinPath(vispDir(rootPath), "budget.json");
}

export function promptsArtifactDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "prompts");
}

export function promptArtifactPath(rootPath: string, name: string): string {
  return joinPath(promptsArtifactDir(rootPath), `${name}.prompt.md`);
}
