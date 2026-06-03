import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { type ReconcileChangedFile } from "../artifacts/schemas/reconcile.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { reconcileFinding, type ReconcileFindingDraft } from "./reconcile-findings.js";

function behaviorChanging(input: {
  readonly task?: Task;
  readonly changedFiles: readonly ReconcileChangedFile[];
}): boolean {
  const text = input.task === undefined ? "" : `${input.task.title} ${input.task.description}`.toLowerCase();

  return Boolean(input.task?.acceptanceCriterionIds.length) ||
    /add|update|create|delete|validate|calculate|permission|api|persistence|state|workflow/.test(text) ||
    input.changedFiles.some((file) => /^(src|app|lib|server|client)\//.test(file.path));
}

function meaningfulAllowedFiles(task: Task | undefined): readonly string[] {
  return (task?.allowedFiles ?? []).filter((filePath) =>
    filePath.trim().length > 0 && filePath.trim().toUpperCase() !== "TBD"
  );
}

export function reconcileTaskAlignment(input: {
  readonly task?: Task;
  readonly changedFiles: readonly ReconcileChangedFile[];
  readonly contextPackFound: boolean;
  readonly validationEvidenceFound: boolean;
}): {
  readonly taskAlignment: {
    readonly status: "passed" | "warnings" | "failed";
    readonly taskExists: boolean;
    readonly requirementLinks: readonly string[];
    readonly acceptanceCriterionLinks: readonly string[];
    readonly changedFilesInScope: boolean;
    readonly forbiddenFilesChanged: readonly string[];
    readonly validationEvidenceFound: boolean;
    readonly contextPackFound: boolean;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly findings: readonly ReconcileFindingDraft[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const findings: ReconcileFindingDraft[] = [];
  const forbidden = input.changedFiles
    .filter((file) => file.mappingStatus === "forbidden")
    .map((file) => file.path);
  const outOfScope = input.changedFiles.filter((file) =>
    !file.isVispGeneratedFile &&
      file.mappingStatus === "unmapped" &&
      input.task !== undefined &&
      meaningfulAllowedFiles(input.task).length > 0
  );

  if (input.task !== undefined && input.task.requirementIds.length === 0) {
    errors.push(`${input.task.id} has no requirement IDs.`);
    findings.push(
      reconcileFinding({
        category: "task-alignment",
        severity: "error",
        driftType: "task_without_requirement",
        title: "Task has no requirement mapping",
        description: "The selected task cannot be reconciled to requirements.",
        evidence: `${input.task.id} requirementIds is empty.`,
        recommendation: "Map the task to a requirement before reconciliation.",
        relatedTaskId: input.task.id
      })
    );
  }

  if (input.task !== undefined && input.task.acceptanceCriterionIds.length === 0 && behaviorChanging(input)) {
    const severity = input.task.riskLevel === "high" ? "error" : "warning";
    const message = `${input.task.id} has no acceptance criterion IDs.`;

    if (severity === "error") errors.push(message);
    else warnings.push(message);

    findings.push(
      reconcileFinding({
        category: "task-alignment",
        severity,
        driftType: "task_without_acceptance_criterion",
        title: "Task has no acceptance criterion mapping",
        description: "The task appears behavior-changing but lacks acceptance criterion evidence.",
        evidence: message,
        recommendation: "Map acceptance criteria or document why validation is manual/static.",
        relatedTaskId: input.task.id,
        relatedRequirementIds: input.task.requirementIds
      })
    );
  }

  if (!input.contextPackFound) {
    warnings.push("Context pack is missing.");
    findings.push(
      reconcileFinding({
        category: "task-alignment",
        severity: "warning",
        driftType: "traceability_missing_or_stale",
        title: "Context pack missing",
        description: "No task context pack was found.",
        evidence: "context/T001.context.json is missing or unreadable.",
        recommendation: input.task === undefined ? "Run visp context for the task." : `Run visp context ${input.task.id}.`,
        relatedTaskId: input.task?.id ?? null
      })
    );
  }

  if (!input.validationEvidenceFound) {
    warnings.push("Validation commands or verification evidence are missing.");
  }

  for (const file of outOfScope) {
    errors.push(`Out-of-scope file changed: ${file.path}.`);
  }

  return {
    taskAlignment: {
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warnings" : "passed",
      taskExists: input.task !== undefined,
      requirementLinks: input.task?.requirementIds ?? [],
      acceptanceCriterionLinks: input.task?.acceptanceCriterionIds ?? [],
      changedFilesInScope: outOfScope.length === 0 && forbidden.length === 0,
      forbiddenFilesChanged: forbidden,
      validationEvidenceFound: input.validationEvidenceFound,
      contextPackFound: input.contextPackFound,
      warnings,
      errors
    },
    findings
  };
}

export function reconcileRequirementCoverage(input: {
  readonly task?: Task;
  readonly taskGraph: TaskGraphArtifact;
  readonly spec?: SpecArtifact;
  readonly traceability?: TraceabilityMatrix;
  readonly changedFiles: readonly ReconcileChangedFile[];
}): {
  readonly requirementCoverage: {
    readonly status: "passed" | "warnings" | "failed";
    readonly items: readonly {
      readonly requirementId: string;
      readonly acceptanceCriterionIds: readonly string[];
      readonly taskIds: readonly string[];
      readonly filePaths: readonly string[];
      readonly status: "passed" | "warnings" | "failed";
    }[];
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly findings: readonly ReconcileFindingDraft[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const findings: ReconcileFindingDraft[] = [];
  const tasks = input.task === undefined ? input.taskGraph.tasks : [input.task];
  const specRequirements = new Set(input.spec?.requirements.map((requirement) => requirement.id) ?? []);
  const specCriteria = new Set(input.spec?.acceptanceCriteria.map((criterion) => criterion.id) ?? []);

  if (input.spec === undefined) {
    warnings.push("Spec artifact is missing; requirement coverage is partial.");
  }

  for (const task of tasks) {
    for (const requirementId of task.requirementIds) {
      if (input.spec !== undefined && !specRequirements.has(requirementId)) {
        const message = `${task.id} references missing requirement ${requirementId}.`;
        errors.push(message);
        findings.push(
          reconcileFinding({
            category: "requirement-coverage",
            severity: "error",
            driftType: "unmapped_requirement",
            title: "Task references missing requirement",
            description: "A task requirement ID does not exist in spec.json.",
            evidence: message,
            recommendation: "Fix the task graph or regenerate the spec/task artifacts.",
            relatedTaskId: task.id,
            relatedRequirementIds: [requirementId]
          })
        );
      }
    }

    for (const criterionId of task.acceptanceCriterionIds) {
      if (input.spec !== undefined && !specCriteria.has(criterionId)) {
        const message = `${task.id} references missing acceptance criterion ${criterionId}.`;
        errors.push(message);
        findings.push(
          reconcileFinding({
            category: "requirement-coverage",
            severity: "error",
            driftType: "unmapped_acceptance_criterion",
            title: "Task references missing acceptance criterion",
            description: "A task acceptance criterion ID does not exist in spec.json.",
            evidence: message,
            recommendation: "Fix the task graph or regenerate spec/task artifacts.",
            relatedTaskId: task.id,
            relatedAcceptanceCriterionIds: [criterionId]
          })
        );
      }
    }
  }

  const changedSourceWithoutRequirement = input.changedFiles.some((file) =>
    !file.isVispGeneratedFile &&
      !file.isTestFile &&
      !file.isDependencyFile &&
      file.relatedRequirementIds.length === 0 &&
      /^(src|app|lib|server|client)\//.test(file.path)
  );

  if (changedSourceWithoutRequirement) {
    const message = "Changed source files do not map to any requirement.";
    warnings.push(message);
    findings.push(
      reconcileFinding({
        category: "requirement-coverage",
        severity: "warning",
        driftType: "spec_behavior_gap",
        title: "Changed source has no requirement evidence",
        description: "At least one changed source file has no requirement mapping.",
        evidence: message,
        recommendation: "Confirm this behavior is in scope or add a follow-up spec/task update.",
        relatedTaskId: input.task?.id ?? null
      })
    );
  }

  const items = tasks.flatMap((task) =>
    task.requirementIds.map((requirementId) => ({
      requirementId,
      acceptanceCriterionIds: task.acceptanceCriterionIds,
      taskIds: [task.id],
      filePaths: input.changedFiles
        .filter((file) => file.relatedTaskIds.includes(task.id) || file.relatedRequirementIds.includes(requirementId))
        .map((file) => file.path),
      status: "passed" as const
    }))
  );

  return {
    requirementCoverage: {
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warnings" : "passed",
      items,
      warnings,
      errors
    },
    findings
  };
}

export function reconcileDependencies(input: {
  readonly changedFiles: readonly ReconcileChangedFile[];
  readonly task?: Task;
  readonly plan?: PlanDraftArtifact;
}): {
  readonly dependencyEvidence: {
    readonly status: "passed" | "warnings" | "failed";
    readonly changedDependencyFiles: readonly string[];
    readonly approvedByTaskScope: boolean;
    readonly approvedByPlan: boolean;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly findings: readonly ReconcileFindingDraft[];
} {
  const changedDependencyFiles = input.changedFiles
    .filter((file) => file.isDependencyFile)
    .map((file) => file.path)
    .sort();
  const approvedByTaskScope = Boolean(input.task &&
    [...input.task.allowedFiles, ...(input.task.expectedFiles ?? [])].some((file) =>
      changedDependencyFiles.includes(file)
    ));
  const approvedByPlan = Boolean(input.plan?.dependencies.newDependenciesRequired && input.plan.dependencies.requiresApproval);
  const warnings: string[] = [];
  const errors: string[] = [];
  const findings: ReconcileFindingDraft[] = [];

  if (changedDependencyFiles.length > 0) {
    if (input.plan !== undefined && !input.plan.dependencies.newDependenciesRequired) {
      errors.push(`Plan says no new dependencies, but dependency files changed: ${changedDependencyFiles.join(", ")}.`);
    } else if (!approvedByTaskScope && !approvedByPlan) {
      errors.push(`Dependency files changed without approval: ${changedDependencyFiles.join(", ")}.`);
    } else {
      warnings.push(`Dependency files changed and require human approval: ${changedDependencyFiles.join(", ")}.`);
    }
  }

  for (const error of errors) {
    findings.push(
      reconcileFinding({
        category: "dependencies",
        severity: "error",
        driftType: "dependency_change_without_approval",
        title: "Unapproved dependency change",
        description: "Dependency-sensitive files changed without deterministic approval.",
        evidence: error,
        recommendation: "Revert dependency changes or add task/plan approval.",
        relatedTaskId: input.task?.id ?? null,
        relatedRequirementIds: input.task?.requirementIds ?? [],
        relatedAcceptanceCriterionIds: input.task?.acceptanceCriterionIds ?? []
      })
    );
  }

  return {
    dependencyEvidence: {
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
