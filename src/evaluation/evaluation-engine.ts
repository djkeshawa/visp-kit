import {
  type EvaluationCheck,
  type EvaluationReport
} from "../artifacts/schemas/evaluation.schema.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { type NextStep } from "../orchestrator/next-step.js";
import { evaluationResult } from "./evaluation-report.js";

function numbered(checks: readonly Omit<EvaluationCheck, "id">[]): readonly EvaluationCheck[] {
  return checks.map((check, index) => ({
    id: `EVAL${String(index + 1).padStart(3, "0")}`,
    ...check
  }));
}

function check(input: Omit<EvaluationCheck, "id">): Omit<EvaluationCheck, "id"> {
  return input;
}

export function evaluateProject(input: {
  readonly state: ProjectState;
  readonly next: NextStep;
  readonly strict: boolean;
  readonly generatedAt: string;
  readonly reportPath: string | null;
  readonly jsonPath: string | null;
}): EvaluationReport {
  const state = input.state;
  const checks: Array<Omit<EvaluationCheck, "id">> = [];

  if (!state.initialized) {
    checks.push(check({
      category: "workflow",
      severity: "error",
      title: "Project is not initialized",
      description: "The target path does not contain a .visp project.",
      recommendation: "Run visp init.",
      file: ".visp"
    }));
  }

  if (!state.scanned) {
    checks.push(check({
      category: "workflow",
      severity: input.strict ? "error" : "warning",
      title: "Scan cache is missing",
      description: "The project scan cache is incomplete or pending.",
      recommendation: "Run visp scan.",
      file: ".visp/cache/scan-meta.json"
    }));
  }

  if (!state.constitution) {
    checks.push(check({
      category: "policy",
      severity: input.strict ? "error" : "warning",
      title: "Compact constitution is missing",
      description: "The project constitution is not available to constrain agent behavior.",
      recommendation: "Run visp constitution.",
      file: ".visp/memory/constitution.compact.md"
    }));
  }

  if (state.selectedFeature === undefined) {
    checks.push(check({
      category: "workflow",
      severity: "warning",
      title: "No active feature",
      description: "Evaluation is limited because no active feature is selected.",
      recommendation: "Run visp feature \"<idea>\".",
      file: ".visp/status.json"
    }));
  } else {
    for (const [key, label] of [
      ["clarifications", "Clarifications"],
      ["spec", "Specification"],
      ["plan", "Plan"],
      ["taskGraph", "Task graph"],
      ["context", "Context pack"],
      ["verification", "Verification"],
      ["review", "Review"],
      ["reconcile", "Reconciliation"]
    ] as const) {
      if (!state.artifactSummary[key]) {
        checks.push(check({
          category: key === "context" ? "context" : key === "verification" || key === "review" || key === "reconcile" ? "evidence" : "workflow",
          severity: input.strict && ["spec", "plan", "taskGraph"].includes(key) ? "error" : "warning",
          title: `${label} missing`,
          description: `${label} evidence is not available for the selected feature/task.`,
          recommendation: input.next.nextCommand,
          file: state.selectedFeature.relativePath,
          taskId: state.selectedTask?.id
        }));
      }
    }
  }

  if (state.taskGraph !== undefined) {
    for (const task of state.taskGraph.tasks) {
      if (task.requirementIds.length === 0) {
        checks.push(check({
          category: "traceability",
          severity: "error",
          title: "Task has no requirement mapping",
          description: `${task.id} is not mapped to any requirement.`,
          recommendation: "Regenerate or repair the task graph.",
          file: state.selectedFeature?.relativePath ?? null,
          taskId: task.id
        }));
      }

      if (task.acceptanceCriterionIds.length === 0 && /add|update|create|delete|validate|calculate|workflow/i.test(task.title)) {
        checks.push(check({
          category: "traceability",
          severity: "warning",
          title: "Behavior task has no acceptance criteria",
          description: `${task.id} appears to change behavior but has no acceptance criterion mapping.`,
          recommendation: "Add acceptance criterion IDs to the task graph.",
          file: state.selectedFeature?.relativePath ?? null,
          taskId: task.id
        }));
      }
    }
  }

  if (state.contextPack !== undefined && state.contextPack.overBudget) {
    checks.push(check({
      category: "budget",
      severity: "warning",
      title: "Context is over budget",
      description: state.contextPack.recommendation,
      recommendation: "Split the task or lower context scope.",
      file: state.selectedFeature?.relativePath ?? null,
      taskId: state.selectedTask?.id
    }));
  }

  if (state.verification?.success === false) {
    checks.push(check({
      category: "evidence",
      severity: "error",
      title: "Verification failed",
      description: "Latest verification evidence reports failure.",
      recommendation: state.selectedTask === undefined ? "Run visp verify." : `Run visp verify --task ${state.selectedTask.id}.`,
      file: state.selectedFeature?.relativePath ?? null,
      taskId: state.selectedTask?.id
    }));
  }

  if (state.review?.result === "failed") {
    checks.push(check({
      category: "evidence",
      severity: "error",
      title: "Review failed",
      description: "Latest review report has blocking findings.",
      recommendation: state.selectedTask === undefined ? "Run visp review." : `Run visp review --task ${state.selectedTask.id}.`,
      file: state.selectedFeature?.relativePath ?? null,
      taskId: state.selectedTask?.id
    }));
  }

  if (state.reconcile?.result === "failed") {
    checks.push(check({
      category: "evidence",
      severity: "error",
      title: "Reconciliation failed",
      description: "Latest reconciliation report has blocking drift.",
      recommendation: state.selectedTask === undefined ? "Run visp reconcile." : `Run visp reconcile --task ${state.selectedTask.id}.`,
      file: state.selectedFeature?.relativePath ?? null,
      taskId: state.selectedTask?.id
    }));
  }

  if (state.pr !== undefined && state.pr.errors.length > 0) {
    checks.push(check({
      category: "pr",
      severity: "error",
      title: "PR summary has errors",
      description: "The generated PR artifact reports blocking issues.",
      recommendation: "Fix the PR readiness issues and rerun visp pr.",
      file: state.selectedFeature?.relativePath ?? null
    }));
  }

  const finalChecks = numbered(checks);
  const result = evaluationResult(finalChecks);

  return {
    success: result !== "failed",
    targetPath: state.targetPath,
    featureId: state.selectedFeature?.id ?? null,
    featureSlug: state.selectedFeature?.slug ?? null,
    taskId: state.selectedTask?.id ?? null,
    result,
    generatedAt: input.generatedAt,
    checks: [...finalChecks],
    warnings: finalChecks
      .filter((item) => item.severity === "warning")
      .map((item) => `${item.id}: ${item.title}`),
    errors: finalChecks
      .filter((item) => item.severity === "error")
      .map((item) => `${item.id}: ${item.title}`),
    reportPath: input.reportPath,
    jsonPath: input.jsonPath,
    nextCommand: input.next.nextCommand
  };
}
