import {
  type EvaluationCheck,
  type EvaluationCoverage
} from "../artifacts/schemas/evaluation.schema.js";

export type EvaluationCheckDraft = Omit<EvaluationCheck, "id">;

/**
 * One named inspection, and either the findings it produced or the reason its
 * input was not there to inspect.
 *
 * Splitting "ran and found nothing" from "could not run" is the whole point.
 * Before LC-108 the engine returned a flat list of problems: an evaluation that
 * inspected nothing and an evaluation that inspected everything and was happy
 * produced the same empty list, printed as `Checks: 0` under `Result: passed`.
 */
export type EvaluationInspection = {
  readonly name: string;
  readonly outcome:
    | { readonly kind: "ran"; readonly findings: readonly EvaluationCheckDraft[] }
    | { readonly kind: "skipped"; readonly reason: string };
};

export function ran(name: string, findings: readonly EvaluationCheckDraft[]): EvaluationInspection {
  return { name, outcome: { kind: "ran", findings } };
}

export function skipped(name: string, reason: string): EvaluationInspection {
  return { name, outcome: { kind: "skipped", reason } };
}

export function inspectionFindings(
  inspections: readonly EvaluationInspection[]
): readonly EvaluationCheckDraft[] {
  return inspections.flatMap((inspection) =>
    inspection.outcome.kind === "ran" ? inspection.outcome.findings : []
  );
}

export function buildEvaluationCoverage(
  inspections: readonly EvaluationInspection[]
): EvaluationCoverage {
  const performedChecks = inspections
    .filter((inspection) => inspection.outcome.kind === "ran")
    .map((inspection) => inspection.name);
  const skippedChecks = inspections.flatMap((inspection) =>
    inspection.outcome.kind === "skipped"
      ? [{ inspection: inspection.name, reason: inspection.outcome.reason }]
      : []
  );

  return {
    description:
      performedChecks.length === 0
        ? "This evaluation ran no checks, so its verdict rests on nothing."
        : `Evaluated ${performedChecks.length} of ${inspections.length} checks; ${skippedChecks.length} could not run.`,
    checksPerformed: performedChecks.length,
    performedChecks,
    skippedChecks,
    empty: performedChecks.length === 0
  };
}

/**
 * An evaluation that ran no checks is a failure, never a pass — the same rule
 * `visp-kit review` applies to an empty review scope, and for the same reason:
 * a green verdict with no evidence behind it is worse than a red one, because
 * nothing about it looks wrong.
 *
 * In practice the project-level checks always run, so this is a fail-closed
 * backstop rather than a routine path. It exists so that adding a skip
 * condition to those checks later cannot quietly reintroduce the pass over
 * nothing.
 */
export function noChecksPerformedFinding(coverage: EvaluationCoverage): EvaluationCheckDraft {
  const reasons =
    coverage.skippedChecks.length === 0
      ? "No inspection was attempted."
      : coverage.skippedChecks.map((entry) => `${entry.inspection}: ${entry.reason}`).join("; ");

  return {
    category: "workflow",
    severity: "error",
    title: "Evaluation performed no checks",
    description: `${coverage.description} ${reasons}`,
    recommendation:
      "Run visp-kit next and complete the workflow far enough that there is something to evaluate.",
    file: ".visp/status.json"
  };
}
