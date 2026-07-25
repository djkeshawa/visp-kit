import { type BaselineEvidence } from "../artifacts/schemas/baseline-evidence.schema.js";
import { type CandidateEvidence } from "../artifacts/schemas/candidate-evidence.schema.js";
import { type AssuranceCaseWithoutHash } from "../artifacts/schemas/assurance-case.schema.js";
import { type EvidenceResult } from "../artifacts/schemas/evidence.schema.js";
import { type EvidenceProviderIdentity } from "../artifacts/schemas/evidence.schema.js";
import { type EvidenceProviderRun } from "../artifacts/schemas/provider-run.schema.js";
import { type OraclePlanOracle } from "../artifacts/schemas/oracle-plan.schema.js";
import { compareUtf16CodeUnits } from "../integration/canonical-json.js";
import { deriveEvidenceConclusion } from "./assurance-semantics.js";

type Comparison = AssuranceCaseWithoutHash["evidenceComparisons"][number];
type EvidenceSide = Comparison["baseline"];
type EvidenceOutcome = EvidenceSide["outcome"];

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareUtf16CodeUnits);
}

function relevantResults(
  runs: readonly EvidenceProviderRun[],
  oracle: OraclePlanOracle
): EvidenceResult[] {
  return runs.flatMap((run) =>
    run.results.filter(
      (result) => result.target.kind === "validation_oracle" && result.target.oracleId === oracle.id
    )
  );
}

function uncertainty(input: {
  readonly artifactAvailable: boolean;
  readonly artifactOutcome?: EvidenceOutcome;
  readonly missingOracle: boolean;
  readonly runs: readonly EvidenceProviderRun[];
  readonly results: readonly EvidenceResult[];
  readonly requiredProviders: readonly EvidenceProviderIdentity[];
  readonly testStrengthIssue?: string;
  readonly issue?: string;
}): EvidenceSide["uncertainty"] {
  const resultProviders = new Set(
    input.results.map((result) => `${result.provider.id}\0${result.provider.version}`)
  );
  const reasons = sortedUnique([
    ...(input.issue === undefined ? [] : [input.issue]),
    ...(!input.artifactAvailable ? ["Evidence artifact is unavailable."] : []),
    ...(input.artifactOutcome === undefined
      ? ["Top-level evidence outcome is missing."]
      : input.artifactOutcome === "passed" || input.artifactOutcome === "failed"
        ? []
        : [`Top-level evidence outcome is ${input.artifactOutcome}.`]),
    ...(input.missingOracle ? ["Locked oracle result is missing."] : []),
    ...(input.results.length === 0 ? ["Exact validation-oracle evidence is missing."] : []),
    ...input.requiredProviders
      .filter((provider) => !resultProviders.has(`${provider.id}\0${provider.version}`))
      .map(
        (provider) =>
          `Required provider ${provider.id}@${provider.version} has no exact oracle result.`
      ),
    ...input.runs
      .filter((run) => run.status === "inconclusive")
      .map(
        (run) =>
          run.failure?.reason ??
          `Provider ${run.provider.id}@${run.provider.version} was inconclusive.`
      ),
    ...input.results.flatMap((result) => [
      ...(result.freshness.status === "fresh"
        ? []
        : [
            result.freshness.status === "stale"
              ? `Evidence ${result.id} is stale: ${result.freshness.reason}`
              : `Evidence ${result.id} freshness is unknown: ${result.freshness.reason}`
          ]),
      ...(result.outcome.status === "passed" || result.outcome.status === "failed"
        ? []
        : [
            `Evidence ${result.id} outcome is ${result.outcome.status}: ${
              "reason" in result.outcome ? result.outcome.reason : "required proof did not pass"
            }.`
          ])
    ]),
    ...(input.testStrengthIssue === undefined ? [] : [input.testStrengthIssue])
  ]);
  return reasons.length === 0 ? { status: "none", reasons: [] } : { status: "unresolved", reasons };
}

function freshness(
  runs: readonly EvidenceProviderRun[],
  results: readonly EvidenceResult[]
): EvidenceSide["freshness"] {
  if (results.some((result) => result.freshness.status === "stale")) return "stale";
  if (
    results.length === 0 ||
    runs.some((run) => run.status === "inconclusive") ||
    results.some((result) => result.freshness.status === "unknown")
  ) {
    return "unknown";
  }
  return "fresh";
}

function independence(
  results: readonly EvidenceResult[],
  fallback: EvidenceSide["independence"]
): EvidenceSide["independence"] {
  const values = new Set(results.map((result) => result.independence));
  const conservativeOrder: EvidenceSide["independence"][] = [
    "implementer_authored",
    "pre_approved",
    "pre_existing",
    "human_attestation",
    "independent_challenger"
  ];
  return conservativeOrder.find((value) => values.has(value)) ?? fallback;
}

function side(input: {
  readonly bindingId: string;
  readonly oracleEvidenceId?: string;
  readonly oracleOutcome?: EvidenceOutcome;
  readonly artifactAvailable: boolean;
  readonly artifactOutcome?: EvidenceOutcome;
  readonly missingOracle: boolean;
  readonly runs: readonly EvidenceProviderRun[];
  readonly results: readonly EvidenceResult[];
  readonly fallbackIndependence: EvidenceSide["independence"];
  readonly requiredProviders: readonly EvidenceProviderIdentity[];
  readonly testStrengthIssue?: string;
  readonly issue?: string;
}): EvidenceSide {
  const hasMissingProvider = input.requiredProviders.some(
    (provider) =>
      !input.results.some(
        (result) =>
          result.provider.id === provider.id && result.provider.version === provider.version
      )
  );
  const failed =
    input.artifactOutcome === "failed" ||
    input.oracleOutcome === "failed" ||
    input.results.some((result) => result.outcome.status === "failed");
  const inconclusive =
    !input.artifactAvailable ||
    input.artifactOutcome === undefined ||
    input.artifactOutcome === "inconclusive" ||
    input.artifactOutcome === "not_applicable" ||
    input.oracleOutcome === undefined ||
    input.oracleOutcome === "inconclusive" ||
    input.results.length === 0 ||
    hasMissingProvider ||
    input.runs.some((run) => run.status === "inconclusive") ||
    input.results.some(
      (result) => result.freshness.status !== "fresh" || result.outcome.status !== "passed"
    ) ||
    input.testStrengthIssue !== undefined ||
    input.issue !== undefined;
  const outcome: EvidenceOutcome = failed
    ? "failed"
    : inconclusive
      ? "inconclusive"
      : (input.oracleOutcome ?? "inconclusive");
  return {
    outcome,
    source: {
      bindingId: input.bindingId,
      evidenceIds: sortedUnique([
        ...(input.oracleEvidenceId === undefined ? [] : [input.oracleEvidenceId]),
        ...input.results.map((result) => result.id)
      ])
    },
    freshness: freshness(input.runs, input.results),
    independence: independence(input.results, input.fallbackIndependence),
    uncertainty: uncertainty(input)
  };
}

function observed(value: "passed" | "failed" | "inconclusive" | undefined): EvidenceOutcome {
  return value ?? "inconclusive";
}

export function buildEvidenceComparisons(input: {
  readonly oracles: readonly OraclePlanOracle[];
  readonly claims: readonly AssuranceCaseWithoutHash["claims"][number][];
  readonly baseline?: BaselineEvidence;
  readonly candidate?: CandidateEvidence;
  readonly baselineBindingId: string;
  readonly candidateBindingId: string;
  readonly baselineIssue?: string;
  readonly candidateIssue?: string;
  readonly requiredProviders?: readonly EvidenceProviderIdentity[];
}): Comparison[] {
  return [...input.oracles]
    .sort((left, right) => compareUtf16CodeUnits(left.id, right.id))
    .map((oracle) => {
      const baselineOracle = input.baseline?.oracles.find((value) => value.oracleId === oracle.id);
      const candidateOracle = input.candidate?.oracles.find(
        (value) => value.oracleId === oracle.id
      );
      const baselineRuns = input.baseline?.providerRuns ?? [];
      const candidateRuns = input.candidate?.providerRuns ?? [];
      const baselineResults = relevantResults(baselineRuns, oracle);
      const candidateResults = relevantResults(candidateRuns, oracle);
      const requiredProviders = input.requiredProviders ?? [
        ...new Map(
          [...baselineRuns, ...candidateRuns].map((run) => [
            `${run.provider.id}\0${run.provider.version}`,
            run.provider
          ])
        ).values()
      ];
      const baseline = side({
        bindingId: input.baselineBindingId,
        oracleEvidenceId: baselineOracle === undefined ? undefined : `baseline-oracle:${oracle.id}`,
        oracleOutcome: observed(baselineOracle?.observed),
        artifactAvailable: input.baseline !== undefined,
        artifactOutcome: input.baseline?.outcome,
        missingOracle: baselineOracle === undefined,
        runs: baselineRuns,
        results: baselineResults,
        fallbackIndependence: "pre_existing",
        requiredProviders,
        issue: input.baselineIssue
      });
      const candidate = side({
        bindingId: input.candidateBindingId,
        oracleEvidenceId:
          candidateOracle === undefined ? undefined : `candidate-oracle:${oracle.id}`,
        oracleOutcome: observed(candidateOracle?.candidate.observed),
        artifactAvailable: input.candidate !== undefined,
        artifactOutcome: input.candidate?.outcome,
        missingOracle: candidateOracle === undefined,
        runs: candidateRuns,
        results: candidateResults,
        fallbackIndependence:
          input.candidate?.testStrength.independence[0] ?? "implementer_authored",
        requiredProviders,
        testStrengthIssue:
          input.candidate?.testStrength.status === "inconclusive"
            ? `Candidate test strength is inconclusive: ${input.candidate.testStrength.reason}`
            : undefined,
        issue: input.candidateIssue
      });
      const providerMap = new Map<string, EvidenceProviderIdentity>();
      for (const provider of requiredProviders) {
        providerMap.set(`${provider.id}\0${provider.version}`, provider);
      }
      for (const result of [...baselineResults, ...candidateResults]) {
        providerMap.set(`${result.provider.id}\0${result.provider.version}`, result.provider);
      }
      const providers = [...providerMap.values()].sort(
        (left, right) =>
          compareUtf16CodeUnits(left.id, right.id) ||
          compareUtf16CodeUnits(left.version, right.version)
      );
      return {
        id: `EC-${oracle.id}`,
        providers,
        claimIds: input.claims
          .filter(
            (claim) =>
              claim.source.kind === "acceptance_criterion" &&
              claim.source.requirementId === oracle.requirementId &&
              claim.source.acceptanceCriterionId === oracle.acceptanceCriterionId
          )
          .map((claim) => claim.id)
          .sort(compareUtf16CodeUnits),
        baseline,
        candidate,
        conclusion: deriveEvidenceConclusion(baseline, candidate)
      };
    });
}
