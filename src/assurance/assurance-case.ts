import {
  assuranceCaseSchema,
  type AssuranceCase,
  type AssuranceCaseWithoutHash
} from "../artifacts/schemas/assurance-case.schema.js";
import { type DiffSnapshot } from "../artifacts/schemas/diff-snapshot.schema.js";
import { type OverrideRecord } from "../artifacts/schemas/override.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { compareUtf16CodeUnits } from "../integration/canonical-json.js";
import { createAssuranceCaseHashV1_1 } from "./assurance-case-hash.js";
import { deriveAssuranceVerdict, deriveCandidateStateSha } from "./assurance-semantics.js";
import { assuranceChangeUnits } from "./diff-snapshot.js";

type Binding = AssuranceCaseWithoutHash["bindings"][number];
type Claim = AssuranceCaseWithoutHash["claims"][number];
type Comparison = AssuranceCaseWithoutHash["evidenceComparisons"][number];
type Hotspot = AssuranceCaseWithoutHash["hotspots"][number];
type UnresolvedItem = AssuranceCaseWithoutHash["unresolvedItems"][number];
type ManualCheck = AssuranceCaseWithoutHash["manualChecks"][number];
type ChallengerFinding = AssuranceCaseWithoutHash["challengerFindings"][number];

function sortedById<Value extends { readonly id: string }>(values: readonly Value[]): Value[] {
  return [...values].sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
}

function nextAction(
  taskId: string,
  caseVerdict: AssuranceCaseWithoutHash["verdict"]
): AssuranceCaseWithoutHash["nextAction"] {
  if (caseVerdict === "passed") {
    return {
      command: `visp review --task ${taskId}`,
      reason: "The deterministic assurance case passed and is ready for review."
    };
  }
  if (caseVerdict === "failed") {
    return {
      command: `visp verify --candidate --task ${taskId}`,
      reason: "Candidate evidence regressed or failed and must be regenerated."
    };
  }
  return {
    command: `visp assurance generate --task ${taskId}`,
    reason: "Resolve the reported uncertainty or mandatory hotspots, then regenerate assurance."
  };
}

export function buildAssuranceCase(input: {
  readonly actionId: `sha256:${string}`;
  readonly featureId: string;
  readonly featureSlug: string;
  readonly taskId: string;
  readonly assuranceProfile: AssuranceCaseWithoutHash["assuranceProfile"];
  readonly bindings: readonly Binding[];
  readonly baselineState: AssuranceCaseWithoutHash["codeStates"]["baseline"];
  readonly snapshot: DiffSnapshot;
  readonly claims: readonly Claim[];
  readonly comparisons: readonly Comparison[];
  readonly hotspots: readonly Hotspot[];
  readonly spec: Pick<SpecArtifact, "assumptions">;
  readonly unresolvedItems: readonly UnresolvedItem[];
  readonly overrides: readonly OverrideRecord[];
  readonly manualChecks?: readonly ManualCheck[];
  readonly challengerFindings?: readonly ChallengerFinding[];
}): Result<AssuranceCase, VispError> {
  const specificationBinding = input.bindings.find((binding) => binding.role === "specification");
  const assumptions = input.spec.assumptions.map((assumption) => ({
    id: `AS-${assumption.id}`,
    statement: assumption.description,
    sourceBindingIds: specificationBinding === undefined ? [] : [specificationBinding.id]
  }));
  const claimIds = input.claims.map((claim) => claim.id).sort(compareUtf16CodeUnits);
  const overrides = input.overrides
    .filter((override) => override.status === "active")
    .map((override) => ({
      id: `AO-${override.id}`,
      record: override,
      claimIds
    }));
  const caseVerdict = deriveAssuranceVerdict({
    evidenceComparisons: input.comparisons,
    unresolvedItems: input.unresolvedItems,
    manualChecks: input.manualChecks ?? [],
    challengerFindings: input.challengerFindings ?? []
  });
  const candidateBinding = input.bindings.find((binding) => binding.role === "candidate_evidence");
  if (candidateBinding === undefined) {
    return err(new VispError("VALIDATION_FAILED", "Candidate evidence binding is required."));
  }
  const withoutHash: AssuranceCaseWithoutHash = {
    // 1.1: caseHash covers the projection without `nextAction` (D-119), so a
    // command rename can never invalidate this case or its signed approval.
    version: "1.1",
    actionId: input.actionId,
    featureId: input.featureId,
    featureSlug: input.featureSlug,
    taskId: input.taskId,
    assuranceProfile: input.assuranceProfile,
    bindings: sortedById(input.bindings),
    codeStates: {
      baseline: input.baselineState,
      candidate: {
        status: "captured",
        revision: input.snapshot.targetRevision,
        sha256: deriveCandidateStateSha({
          actionId: input.actionId,
          diffStateSha256: input.snapshot.state.stateSha256,
          candidateEvidenceBinding: candidateBinding
        })
      }
    },
    diff: {
      mode: input.snapshot.mode,
      baseRevision: input.snapshot.baseRevision,
      targetRevision: input.snapshot.targetRevision,
      snapshotSha256: input.snapshot.snapshotSha256,
      headRevision: input.snapshot.state.headRevision,
      indexTreeRevision: input.snapshot.state.indexTreeRevision,
      stateSha256: input.snapshot.state.stateSha256
    },
    changeUnits: sortedById(assuranceChangeUnits(input.snapshot)),
    claims: sortedById(input.claims),
    evidenceComparisons: sortedById(input.comparisons),
    hotspots: sortedById(input.hotspots),
    assumptions: sortedById(assumptions),
    unresolvedItems: sortedById(input.unresolvedItems),
    overrides: sortedById(overrides),
    manualChecks: sortedById(input.manualChecks ?? []),
    challengerFindings: sortedById(input.challengerFindings ?? []),
    verdict: caseVerdict,
    nextAction: nextAction(input.taskId, caseVerdict)
  };
  const assuranceCase = {
    ...withoutHash,
    caseHash: createAssuranceCaseHashV1_1(withoutHash)
  };
  const parsed = assuranceCaseSchema.safeParse(assuranceCase);
  return parsed.success
    ? ok(parsed.data)
    : err(
        new VispError(
          "VALIDATION_FAILED",
          `Invalid assurance case: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
        )
      );
}
