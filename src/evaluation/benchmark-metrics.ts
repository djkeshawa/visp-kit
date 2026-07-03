import { type BenchmarkMetrics } from "../artifacts/schemas/evaluation.schema.js";
import { type ProjectState } from "../orchestrator/project-state.js";

export type BenchmarkMetricsInput = {
  readonly state: ProjectState;
  /** estimatedTokens.total of every context pack for the active feature. */
  readonly contextTokenTotals: readonly number[];
  /** sizeBytes of every entry in the scan file index. */
  readonly fileIndexSizeBytes: readonly number[];
  /** Finding counts from the last drift report, when one exists. */
  readonly drift: { readonly errors: number; readonly warnings: number } | null;
};

function ratioOrNull(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.min(1, Math.max(0, numerator / denominator));
}

export function computeBenchmarkMetrics(input: BenchmarkMetricsInput): BenchmarkMetrics {
  const measuredTaskCount = input.contextTokenTotals.length;
  const totalContextTokens = input.contextTokenTotals.reduce((sum, value) => sum + value, 0);
  const averageContextTokens =
    measuredTaskCount === 0 ? 0 : Math.round(totalContextTokens / measuredTaskCount);
  // The whole-repo baseline mirrors what sending every scanned file would cost
  // with the historical chars/4 estimator: bytes ~ chars for source text.
  const wholeRepoTokenBaseline = Math.ceil(
    input.fileIndexSizeBytes.reduce((sum, value) => sum + value, 0) / 4
  );
  const reductionRatio =
    wholeRepoTokenBaseline === 0 || measuredTaskCount === 0
      ? null
      : ratioOrNull(wholeRepoTokenBaseline - averageContextTokens, wholeRepoTokenBaseline);

  const summary = input.state.artifactSummary;
  const summaryValues = [
    summary.clarifications,
    summary.spec,
    summary.plan,
    summary.taskGraph,
    summary.traceability,
    summary.context,
    summary.verification,
    summary.review,
    summary.reconcile,
    summary.pr
  ];
  const presentArtifacts = summaryValues.filter(Boolean).length;

  // Presence (artifactSummary) versus successful schema parse (typed state
  // fields): an artifact that exists but failed validation counts as present
  // yet unparsed.
  const validationPairs: readonly (readonly [present: boolean, parsed: boolean])[] = [
    [summary.spec, input.state.spec !== undefined],
    [summary.plan, input.state.plan !== undefined],
    [summary.taskGraph, input.state.taskGraph !== undefined],
    [summary.traceability, input.state.traceability !== undefined],
    [summary.context, input.state.contextPack !== undefined],
    [summary.verification, input.state.verification !== undefined],
    [summary.review, input.state.review !== undefined],
    [summary.reconcile, input.state.reconcile !== undefined],
    [summary.pr, input.state.pr !== undefined]
  ];
  const presentForValidation = validationPairs.filter(([present]) => present).length;
  const parsedArtifacts = validationPairs.filter(([present, parsed]) => present && parsed).length;

  return {
    contextEfficiency: {
      measuredTaskCount,
      averageContextTokens,
      wholeRepoTokenBaseline,
      reductionRatio
    },
    evidenceCompleteness: {
      presentArtifacts,
      expectedArtifacts: summaryValues.length,
      ratio: presentArtifacts / summaryValues.length
    },
    artifactValidation: {
      parsedArtifacts,
      presentArtifacts: presentForValidation,
      ratio: ratioOrNull(parsedArtifacts, presentForValidation)
    },
    drift: input.drift
  };
}
