import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { type ReviewChangedFile } from "../artifacts/schemas/review.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { isDependencyFile } from "../dependencies/dependency-files.js";
import { normalizeReviewPath } from "./diff-summary.js";
import { finding, type ReviewFindingDraft } from "./review-findings.js";

function dependencyApprovedByTask(task: Task | undefined): boolean {
  if (task === undefined) return false;

  const scoped = new Set([
    ...task.allowedFiles.map(normalizeReviewPath),
    ...(task.expectedFiles ?? []).map(normalizeReviewPath)
  ]);
  const text = `${task.title} ${task.description}`.toLowerCase();

  return [...scoped].some((file) => isDependencyFile(file)) ||
    /dependency|package|manifest|lockfile|install/.test(text);
}

function dependencyApprovedByPlan(plan: PlanDraftArtifact | undefined): boolean {
  return Boolean(plan?.dependencies.newDependenciesRequired && plan.dependencies.requiresApproval);
}

export function reviewDependencies(input: {
  readonly changedFiles: readonly ReviewChangedFile[];
  readonly task?: Task;
  readonly plan?: PlanDraftArtifact;
}): {
  readonly dependencyReview: {
    readonly status: "passed" | "warnings" | "failed";
    readonly changedDependencyFiles: readonly string[];
    readonly approvedByTaskScope: boolean;
    readonly approvedByPlan: boolean;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly findings: readonly ReviewFindingDraft[];
} {
  const changedDependencyFiles = input.changedFiles
    .filter((file) => file.isDependencyFile)
    .map((file) => file.path)
    .sort();
  const approvedByTaskScope = dependencyApprovedByTask(input.task);
  const approvedByPlan = dependencyApprovedByPlan(input.plan);
  const warnings: string[] = [];
  const errors: string[] = [];
  const findings: ReviewFindingDraft[] = [];

  if (changedDependencyFiles.length > 0) {
    if (input.plan !== undefined && !input.plan.dependencies.newDependenciesRequired) {
      errors.push(
        `Dependency files changed even though the plan says no new dependencies are required: ${changedDependencyFiles.join(", ")}.`
      );
    } else if (!approvedByTaskScope && !approvedByPlan) {
      errors.push(
        `Dependency files changed without task or plan approval: ${changedDependencyFiles.join(", ")}.`
      );
    } else {
      warnings.push(
        `Dependency files changed with apparent scope/plan approval: ${changedDependencyFiles.join(", ")}. Human review is required.`
      );
    }
  }

  for (const error of errors) {
    findings.push(
      finding({
        category: "dependencies",
        severity: "error",
        title: "Unapproved dependency change",
        description: "A dependency-sensitive file changed without deterministic approval.",
        evidence: error,
        recommendation: "Revert dependency changes or update the task/plan with explicit approval.",
        relatedTaskId: input.task?.id ?? null,
        relatedRequirementIds: input.task?.requirementIds ?? [],
        relatedAcceptanceCriterionIds: input.task?.acceptanceCriterionIds ?? []
      })
    );
  }

  for (const warning of warnings) {
    findings.push(
      finding({
        category: "dependencies",
        severity: "warning",
        title: "Dependency change needs review",
        description: "A dependency-sensitive file changed and should be manually reviewed.",
        evidence: warning,
        recommendation: "Confirm dependency and lockfile changes are intentional.",
        relatedTaskId: input.task?.id ?? null
      })
    );
  }

  return {
    dependencyReview: {
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warnings" : "passed",
      changedDependencyFiles,
      approvedByTaskScope,
      approvedByPlan,
      warnings,
      errors
    },
    findings
  };
}
