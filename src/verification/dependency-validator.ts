import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type DependencyValidationSection } from "../artifacts/schemas/verification.schema.js";

const dependencyFiles = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json"
]);

function normalize(values: readonly string[] | undefined): readonly string[] {
  return (values ?? []).map((value) => value.replaceAll("\\", "/"));
}

function taskApprovesDependencies(task: Task | undefined): boolean {
  if (task === undefined) return false;

  const scoped = new Set([
    ...normalize(task.allowedFiles),
    ...normalize(task.expectedFiles)
  ]);
  const text = `${task.title} ${task.description}`.toLowerCase();

  return (
    [...dependencyFiles].some((file) => scoped.has(file)) ||
    /dependency|package|lockfile|install/.test(text)
  );
}

function planApprovesDependencies(plan: PlanDraftArtifact | undefined): boolean {
  return Boolean(
    plan?.dependencies.newDependenciesRequired &&
      plan.dependencies.requiresApproval
  );
}

export function validateDependencies(input: {
  readonly changedFiles: readonly string[];
  readonly task?: Task;
  readonly plan?: PlanDraftArtifact;
}): DependencyValidationSection {
  const changedDependencyFiles = normalize(input.changedFiles)
    .filter((file) => dependencyFiles.has(file))
    .sort();
  const approvedByTaskScope = taskApprovesDependencies(input.task);
  const approvedByPlan = planApprovesDependencies(input.plan);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (changedDependencyFiles.length > 0) {
    if (approvedByTaskScope || approvedByPlan) {
      warnings.push(
        `Dependency files changed and are in task or plan scope: ${changedDependencyFiles.join(", ")}. Human review is still required.`
      );
    } else {
      errors.push(
        `Dependency files changed without approval: ${changedDependencyFiles.join(", ")}.`
      );
    }
  }

  return {
    status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warned" : "passed",
    changedDependencyFiles,
    approvedByTaskScope,
    approvedByPlan,
    warnings,
    errors
  };
}
