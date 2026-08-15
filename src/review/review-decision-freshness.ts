/**
 * The inputs a review decision is pinned to, and the check that they still hold.
 *
 * A decision is only meaningful against the exact artifacts the reviewer saw,
 * so each one is recorded here as a path plus a hash — a "freshness input".
 * `validateReconstructedAssuranceInputs` then rebuilds those inputs from disk
 * and refuses to proceed when the rebuilt set disagrees with the assurance
 * case, which is what stops a case being swapped underneath a review.
 *
 * Extracted from `review-decision.ts`.
 */
import { type ZodType } from "zod";

import { oracleApprovalArtifactPath, overridesArtifactPath } from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { baselineEvidenceSchema } from "../artifacts/schemas/baseline-evidence.schema.js";
import { candidateEvidenceSchema } from "../artifacts/schemas/candidate-evidence.schema.js";
import { type AssuranceCase } from "../artifacts/schemas/assurance-case.schema.js";
import { contextPackSchema } from "../artifacts/schemas/context-pack.schema.js";
import {
  diffSnapshotSchema,
  type DiffSnapshot
} from "../artifacts/schemas/diff-snapshot.schema.js";
import {
  oracleApprovalSchema,
  oracleLockSchema
} from "../artifacts/schemas/oracle-authorization.schema.js";
import { oraclePlanSchema } from "../artifacts/schemas/oracle-plan.schema.js";
import { overrideArtifactSchema } from "../artifacts/schemas/override.schema.js";
import { planDraftArtifactSchema } from "../artifacts/schemas/plan.schema.js";
import { policyArtifactSchema } from "../artifacts/schemas/policy.schema.js";
import { specArtifactSchema } from "../artifacts/schemas/spec.schema.js";
import { taskGraphArtifactSchema } from "../artifacts/schemas/task.schema.js";
import { type ReviewDecisionFreshnessInput } from "../artifacts/schemas/review-decision.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { pathExists, readTextFile } from "../core/file-system.js";
import { relativePath, resolvePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { canonicalJsonV1, compareUtf16CodeUnits } from "../integration/canonical-json.js";
import { hashOracleText, hashOracleValue } from "../oracle/oracle-authorization.js";
import { loadAssuranceInputs } from "../assurance/assurance-inputs.js";
import { deriveCandidateStateSha } from "../assurance/assurance-semantics.js";
import { isGeneratedVispReviewFile } from "./diff-summary.js";

type MaterialSchema = ZodType<unknown>;

const schemaByRole: Partial<Record<AssuranceCase["bindings"][number]["role"], MaterialSchema>> = {
  policy: policyArtifactSchema,
  specification: specArtifactSchema,
  plan: planDraftArtifactSchema,
  task_graph: taskGraphArtifactSchema,
  task: taskGraphArtifactSchema,
  context: contextPackSchema,
  oracle_plan: oraclePlanSchema,
  oracle_lock: oracleLockSchema,
  baseline_evidence: baselineEvidenceSchema,
  candidate_evidence: candidateEvidenceSchema,
  diff_snapshot: diffSnapshotSchema
};

export function materialPath(unit: DiffSnapshot["changeUnits"][number]): string[] {
  return unit.kind === "hunk"
    ? [unit.path]
    : [unit.beforePath, unit.afterPath].filter((value): value is string => value !== undefined);
}

export function codeIdentity(snapshot: DiffSnapshot): string {
  return canonicalJsonV1(
    snapshot.changeUnits.filter((unit) => !materialPath(unit).every(isGeneratedVispReviewFile))
  );
}

export async function freshnessInput(input: {
  readonly targetPath: string;
  readonly label: string;
  readonly relativePath: string;
  readonly schema?: MaterialSchema;
}): Promise<Result<ReviewDecisionFreshnessInput, VispError>> {
  const absolutePath = resolvePath(input.targetPath, input.relativePath);
  const exists = await pathExists(absolutePath);
  if (!exists.ok) return exists;
  if (!exists.value) {
    return ok({
      label: input.label,
      path: input.relativePath,
      status: "missing"
    });
  }
  const raw = await readTextFile(absolutePath);
  if (!raw.ok) return raw;
  const sha256 = hashOracleText(raw.value);
  if (input.schema !== undefined) {
    try {
      const parsed = JSON.parse(raw.value) as unknown;
      if (!input.schema.safeParse(parsed).success) {
        return ok({
          label: input.label,
          path: input.relativePath,
          status: "invalid",
          sha256
        });
      }
    } catch {
      return ok({
        label: input.label,
        path: input.relativePath,
        status: "invalid",
        sha256
      });
    }
  }
  return ok({
    label: input.label,
    path: input.relativePath,
    status: "available",
    sha256
  });
}

export async function captureFreshnessInputs(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId: string;
  readonly assuranceCase: AssuranceCase;
}): Promise<Result<readonly ReviewDecisionFreshnessInput[], VispError>> {
  const requested: Array<{
    label: string;
    relativePath: string;
    schema?: MaterialSchema;
  }> = input.assuranceCase.bindings.map((binding) => ({
    label: `binding:${binding.role}`,
    relativePath: binding.path,
    schema: schemaByRole[binding.role]
  }));
  requested.push({
    label: "override_store",
    relativePath: relativePath(input.targetPath, overridesArtifactPath(input.targetPath)),
    schema: overrideArtifactSchema
  });

  const oraclePlanBinding = input.assuranceCase.bindings.find(
    (binding) => binding.role === "oracle_plan"
  );
  if (oraclePlanBinding !== undefined) {
    const plan = await readArtifact(
      resolvePath(input.targetPath, oraclePlanBinding.path),
      oraclePlanSchema,
      { artifactName: "oracle plan" }
    );
    if (plan.ok) {
      for (const evidence of plan.value.testStrengthEvidence) {
        requested.push({
          label: `test_strength:${evidence.path}`,
          relativePath: evidence.path
        });
      }
      if (plan.value.criticalReviewApproval.required) {
        requested.push({
          label: "oracle_approval",
          relativePath: relativePath(
            input.targetPath,
            oracleApprovalArtifactPath(input.targetPath, input.featureKey, input.taskId)
          ),
          schema: oracleApprovalSchema
        });
      }
    }
  }

  const results: ReviewDecisionFreshnessInput[] = [];
  for (const item of requested) {
    const captured = await freshnessInput({
      targetPath: input.targetPath,
      ...item
    });
    if (!captured.ok) return captured;
    results.push(captured.value);
  }
  results.sort(
    (left, right) =>
      compareUtf16CodeUnits(left.label, right.label) || compareUtf16CodeUnits(left.path, right.path)
  );
  return ok(results);
}

export async function validateReconstructedAssuranceInputs(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId: string;
  readonly assuranceCase: AssuranceCase;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<void, VispError>> {
  const loaded = await loadAssuranceInputs({
    targetPath: input.targetPath,
    feature: input.featureKey,
    taskId: input.taskId,
    mode: input.assuranceCase.diff.mode,
    targetRevision:
      input.assuranceCase.diff.mode === "base_to_commit"
        ? input.assuranceCase.diff.targetRevision
        : undefined,
    now: input.now,
    commandRunner: input.commandRunner
  });
  if (!loaded.ok) return loaded;
  const selected = loaded.value.state;
  const plan = loaded.value.authorization.plan;
  const storedSnapshotBinding = input.assuranceCase.bindings.find(
    (binding) => binding.role === "diff_snapshot"
  );
  if (storedSnapshotBinding === undefined) {
    return err(new VispError("VALIDATION_FAILED", "Assurance case has no diff snapshot binding."));
  }
  const storedSnapshot = await readArtifact(
    resolvePath(input.targetPath, storedSnapshotBinding.path),
    diffSnapshotSchema,
    { artifactName: "stored diff snapshot" }
  );
  if (!storedSnapshot.ok) return storedSnapshot;
  const reconstructedBindings = loaded.value.bindings
    .map((binding) =>
      binding.role === "diff_snapshot"
        ? { ...binding, sha256: storedSnapshot.value.snapshotSha256 }
        : binding
    )
    .sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
  const caseBindings = [...input.assuranceCase.bindings].sort((left, right) =>
    compareUtf16CodeUnits(left.id, right.id)
  );
  const reconstructedOverrides = [...loaded.value.overrides].sort((left, right) =>
    compareUtf16CodeUnits(left.id, right.id)
  );
  const caseOverrides = input.assuranceCase.overrides
    .map((item) => item.record)
    .sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
  const candidateBinding = reconstructedBindings.find(
    (binding) => binding.role === "candidate_evidence"
  );
  const expectedCandidateSha =
    candidateBinding === undefined
      ? undefined
      : deriveCandidateStateSha({
          actionId: input.assuranceCase.actionId,
          diffStateSha256: storedSnapshot.value.state.stateSha256,
          candidateEvidenceBinding: candidateBinding
        });
  if (
    selected.selectedFeature.id !== input.assuranceCase.featureId ||
    selected.selectedFeature.slug !== input.assuranceCase.featureSlug ||
    selected.selectedTask.id !== input.assuranceCase.taskId ||
    plan.assuranceProfile !== input.assuranceCase.assuranceProfile ||
    plan.baseCommit.status !== "captured" ||
    plan.baseCommit.commit !== input.assuranceCase.diff.baseRevision ||
    canonicalJsonV1(reconstructedBindings) !== canonicalJsonV1(caseBindings) ||
    canonicalJsonV1(reconstructedOverrides) !== canonicalJsonV1(caseOverrides) ||
    storedSnapshot.value.snapshotSha256 !== input.assuranceCase.diff.snapshotSha256 ||
    input.assuranceCase.codeStates.baseline.status !== "captured" ||
    input.assuranceCase.codeStates.baseline.revision !== plan.baseCommit.commit ||
    input.assuranceCase.codeStates.baseline.sha256 !==
      hashOracleValue({ revision: plan.baseCommit.commit }) ||
    input.assuranceCase.codeStates.candidate.status !== "captured" ||
    input.assuranceCase.codeStates.candidate.revision !== storedSnapshot.value.targetRevision ||
    input.assuranceCase.codeStates.candidate.sha256 !== expectedCandidateSha
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Reconstructed authoritative assurance inputs do not match the assurance case."
      )
    );
  }
  return ok(undefined);
}
