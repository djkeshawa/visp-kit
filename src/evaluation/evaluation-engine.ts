import {
  type EvaluationCheck,
  type EvaluationReport
} from "../artifacts/schemas/evaluation.schema.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { type NextStep } from "../orchestrator/next-step.js";
import { evidenceChecks } from "./checks/evidence-checks.js";
import { traceabilityChecks } from "./checks/traceability-checks.js";
import { featureArtifactChecks, projectReadinessChecks } from "./checks/workflow-checks.js";
import {
  buildEvaluationCoverage,
  inspectionFindings,
  noChecksPerformedFinding,
  type EvaluationCheckDraft,
  type EvaluationInspection
} from "./evaluation-coverage.js";
import { evaluationResult } from "./evaluation-report.js";

function numbered(checks: readonly EvaluationCheckDraft[]): readonly EvaluationCheck[] {
  return checks.map((check, index) => ({
    id: `EVAL${String(index + 1).padStart(3, "0")}`,
    ...check
  }));
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
  const inspections: readonly EvaluationInspection[] = [
    ...projectReadinessChecks({ state, strict: input.strict }),
    featureArtifactChecks({ state, next: input.next, strict: input.strict }),
    traceabilityChecks(state),
    ...evidenceChecks(state)
  ];
  const coverage = buildEvaluationCoverage(inspections);
  const drafts = coverage.empty
    ? [noChecksPerformedFinding(coverage)]
    : inspectionFindings(inspections);
  const finalChecks = numbered(drafts);
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
    coverage,
    nextCommand: input.next.nextCommand
  };
}
