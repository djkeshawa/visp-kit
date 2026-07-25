import { createHash } from "node:crypto";

import { type AssuranceCaseWithoutHash } from "../artifacts/schemas/assurance-case.schema.js";
import { type OraclePlan } from "../artifacts/schemas/oracle-plan.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { canonicalJsonV1, compareUtf16CodeUnits } from "../integration/canonical-json.js";
import { normalizeReviewPath } from "../review/diff-summary.js";
import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { deriveClaimDisposition } from "./assurance-semantics.js";

type Claim = AssuranceCaseWithoutHash["claims"][number];
type ChangeUnit = AssuranceCaseWithoutHash["changeUnits"][number];
type UnresolvedItem = AssuranceCaseWithoutHash["unresolvedItems"][number];

export type ClaimMappingResult = {
  readonly claims: readonly Claim[];
  readonly unresolvedItems: readonly UnresolvedItem[];
  readonly unmappedChangeUnitIds: readonly string[];
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareUtf16CodeUnits);
}

function pathsForUnit(unit: ChangeUnit): string[] {
  return unit.kind === "hunk"
    ? [normalizeReviewPath(unit.path)]
    : sortedUnique(
        [unit.beforePath, unit.afterPath]
          .filter((value): value is string => value !== undefined)
          .map(normalizeReviewPath)
      );
}

function pathMatches(candidate: string, expected: string): boolean {
  const normalizedCandidate = normalizeReviewPath(candidate);
  const normalizedExpected = normalizeReviewPath(expected);
  return normalizedCandidate === normalizedExpected;
}

function matchingUnitIds(units: readonly ChangeUnit[], paths: readonly string[]): string[] {
  return sortedUnique(
    units
      .filter((unit) =>
        pathsForUnit(unit).some((unitPath) =>
          paths.some((expectedPath) => pathMatches(unitPath, expectedPath))
        )
      )
      .map((unit) => unit.id)
  );
}

function criterionClaimId(criterionId: string): string {
  return `CL-AC-${criterionId}`;
}

function evidenceComparisonIds(plan: OraclePlan, acceptanceCriterionId: string): string[] {
  return sortedUnique(
    plan.oracles
      .filter((oracle) => oracle.acceptanceCriterionId === acceptanceCriterionId)
      .map((oracle) => `EC-${oracle.id}`)
  );
}

function invariantClaims(input: {
  readonly spec: SpecArtifact;
  readonly plan: OraclePlan;
}): Array<Omit<Claim, "disposition" | "unresolvedItemIds">> {
  const pending = [
    ...input.spec.businessRules.map((statement, index) => ({
      origin: "business_rule" as const,
      statement,
      sourceOrder: index
    })),
    ...Object.entries(input.spec.nonFunctionalRequirements).flatMap(([category, statements]) =>
      statements.map((statement, index) => ({
        origin: "non_functional" as const,
        statement,
        sourceOrder: index,
        category
      }))
    )
  ];
  pending.sort(
    (left, right) =>
      compareUtf16CodeUnits(left.origin, right.origin) ||
      compareUtf16CodeUnits(left.statement, right.statement) ||
      compareUtf16CodeUnits(
        "category" in left ? left.category : "",
        "category" in right ? right.category : ""
      ) ||
      left.sourceOrder - right.sourceOrder
  );
  const occurrences = new Map<string, number>();
  const invariants = pending.map((invariant) => {
    const identity = {
      origin: invariant.origin,
      statement: invariant.statement,
      ...("category" in invariant ? { category: invariant.category } : {})
    };
    const digest = createHash("sha256")
      .update("visp.assurance-invariant\0canonical-1.0\0", "utf8")
      .update(canonicalJsonV1(identity), "utf8")
      .digest("hex");
    const occurrence = (occurrences.get(digest) ?? 0) + 1;
    occurrences.set(digest, occurrence);
    return {
      invariantId: `INV-${digest}-${occurrence}`,
      origin: invariant.origin,
      statement: invariant.statement
    };
  });

  return invariants.map((invariant) => ({
    id: `CL-${invariant.invariantId}`,
    source: {
      kind: "invariant",
      invariantId: invariant.invariantId,
      origin: invariant.origin
    },
    priority: "must",
    assuranceProfile: input.plan.assuranceProfile,
    statement: invariant.statement,
    changeUnitIds: [],
    evidenceComparisonIds: []
  }));
}

export function mapAssuranceClaims(input: {
  readonly task: Task;
  readonly spec: SpecArtifact;
  readonly traceability: TraceabilityMatrix;
  readonly oraclePlan: OraclePlan;
  readonly changeUnits: readonly ChangeUnit[];
}): Result<ClaimMappingResult, VispError> {
  const requirements = new Map(
    input.spec.requirements.map((requirement) => [requirement.id, requirement])
  );
  const criteria = new Map(
    [
      ...input.spec.acceptanceCriteria,
      ...input.spec.requirements.flatMap((requirement) => requirement.acceptanceCriteria)
    ].map((criterion) => [criterion.id, criterion])
  );
  const claims: Claim[] = [];
  const unresolvedItems: UnresolvedItem[] = [];

  for (const criterionId of sortedUnique(input.task.acceptanceCriterionIds)) {
    const criterion = criteria.get(criterionId);
    if (criterion === undefined) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Task ${input.task.id} references unknown acceptance criterion ${criterionId}.`
        )
      );
    }
    const requirementId = criterion.requirementId;
    const requirement = requirements.get(requirementId);
    if (
      requirement === undefined ||
      !input.task.requirementIds.includes(requirementId) ||
      !requirement.acceptanceCriteria.some((candidate) => candidate.id === criterionId)
    ) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Acceptance criterion ${criterionId} is not authoritatively linked to task ${input.task.id} and requirement ${requirementId}.`
        )
      );
    }
    const tracePaths = input.traceability.entries
      .filter(
        (entry) =>
          entry.requirementId === requirementId &&
          entry.acceptanceCriterionIds.includes(criterionId) &&
          entry.taskIds.includes(input.task.id)
      )
      .flatMap((entry) => [...entry.filePaths, ...entry.testPaths]);
    const changeUnitIds = matchingUnitIds(input.changeUnits, tracePaths);
    const priority = requirement.priority;
    const id = criterionClaimId(criterionId);
    const comparisonIds = evidenceComparisonIds(input.oraclePlan, criterionId);
    const unresolvedItemId = `UI-${id}`;
    const disposition = deriveClaimDisposition({
      priority,
      changeUnitIds,
      evidenceComparisonIds: comparisonIds
    });
    if (disposition === "unresolved") {
      unresolvedItems.push({
        id: unresolvedItemId,
        kind: "claim",
        reason: `No changed unit maps to required acceptance criterion ${criterionId}.`,
        claimIds: [id]
      });
    }
    claims.push({
      id,
      source: {
        kind: "acceptance_criterion",
        requirementId,
        acceptanceCriterionId: criterionId
      },
      priority,
      assuranceProfile: input.oraclePlan.assuranceProfile,
      statement: criterion.description,
      disposition,
      changeUnitIds,
      evidenceComparisonIds: comparisonIds,
      unresolvedItemIds: disposition === "unresolved" ? [unresolvedItemId] : []
    });
  }

  for (const invariant of invariantClaims({
    spec: input.spec,
    plan: input.oraclePlan
  })) {
    const unresolved = invariant.changeUnitIds.length === 0;
    const unresolvedItemId = `UI-${invariant.id}`;
    if (unresolved) {
      unresolvedItems.push({
        id: unresolvedItemId,
        kind: "claim",
        reason: `No changed unit maps to invariant ${invariant.source.kind === "invariant" ? invariant.source.invariantId : invariant.id}.`,
        claimIds: [invariant.id]
      });
    }
    claims.push({
      ...invariant,
      disposition: unresolved ? "unresolved" : "mapped",
      unresolvedItemIds: unresolved ? [unresolvedItemId] : []
    });
  }

  claims.sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
  unresolvedItems.sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
  const mapped = new Set(claims.flatMap((claim) => claim.changeUnitIds));
  return ok({
    claims,
    unresolvedItems,
    unmappedChangeUnitIds: input.changeUnits
      .map((unit) => unit.id)
      .filter((id) => !mapped.has(id))
      .sort(compareUtf16CodeUnits)
  });
}
