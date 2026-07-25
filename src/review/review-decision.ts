import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { type ZodType } from "zod";

import {
  assuranceCaseArtifactPath,
  currentReviewDecisionArtifactPath,
  oracleApprovalArtifactPath,
  overridesArtifactPath,
  reviewDecisionHistoryDir,
  reviewDecisionHistoryArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { baselineEvidenceSchema } from "../artifacts/schemas/baseline-evidence.schema.js";
import { candidateEvidenceSchema } from "../artifacts/schemas/candidate-evidence.schema.js";
import {
  assuranceCaseSchema,
  type AssuranceCase
} from "../artifacts/schemas/assurance-case.schema.js";
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
import {
  currentReviewDecisionPointerSchema,
  reviewDecisionSchema,
  type CurrentReviewDecisionPointer,
  type ReviewDecision,
  type ReviewDecisionFreshnessInput,
  type ReviewDecisionStatus
} from "../artifacts/schemas/review-decision.schema.js";
import { specArtifactSchema } from "../artifacts/schemas/spec.schema.js";
import { taskGraphArtifactSchema } from "../artifacts/schemas/task.schema.js";
import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { VispError, toVispError } from "../core/errors.js";
import { pathExists, readTextFile } from "../core/file-system.js";
import { relativePath, resolvePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { canonicalJsonV1, compareUtf16CodeUnits } from "../integration/canonical-json.js";
import { hashOracleText } from "../oracle/oracle-authorization.js";
import { loadProjectState } from "../orchestrator/project-state.js";
import { loadAssuranceInputs } from "../assurance/assurance-inputs.js";
import { deriveCandidateStateSha } from "../assurance/assurance-semantics.js";
import { hashOracleValue } from "../oracle/oracle-authorization.js";
import { createReviewDecisionHash } from "./review-decision-hash.js";
import { captureDiffSnapshot } from "../assurance/diff-snapshot.js";
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

export type ReviewDecisionCurrentness = {
  readonly status: ReviewDecisionStatus;
  readonly reason: string;
  readonly caseHash?: string;
  readonly decisionHash?: string;
  readonly decision?: ReviewDecision;
};

export type ReviewDecisionWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId: string;
  readonly reviewerId?: string;
  readonly reason?: string;
  readonly reviewedHotspotIds?: readonly string[];
  readonly decision: "accept" | "reject";
  readonly dryRun?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

export type ReviewDecisionWorkflowSummary = {
  readonly success: true;
  readonly taskId: string;
  readonly decision: "accept" | "reject";
  readonly decisionHash: string;
  readonly caseHash: string;
  readonly snapshotHash: string;
  readonly stateHash: string;
  readonly historyPath: string;
  readonly pointerPath: string;
  readonly dryRun: boolean;
  readonly nextCommand: string;
};

export type ReviewDecisionRepairSummary = {
  readonly success: true;
  readonly taskId: string;
  readonly decisionHash: string;
  readonly pointerPath: string;
  readonly dryRun: boolean;
  readonly nextCommand: string;
};

export type ReviewDecisionRequirement = {
  readonly required: boolean;
  readonly currentness: ReviewDecisionCurrentness;
};

function materialPath(unit: DiffSnapshot["changeUnits"][number]): string[] {
  return unit.kind === "hunk"
    ? [unit.path]
    : [unit.beforePath, unit.afterPath].filter((value): value is string => value !== undefined);
}

function codeIdentity(snapshot: DiffSnapshot): string {
  return canonicalJsonV1(
    snapshot.changeUnits.filter((unit) => !materialPath(unit).every(isGeneratedVispReviewFile))
  );
}

async function freshnessInput(input: {
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

async function captureFreshnessInputs(input: {
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

async function validateReconstructedAssuranceInputs(input: {
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

async function loadCase(input: {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId: string;
}): Promise<
  Result<
    {
      readonly targetPath: string;
      readonly featureKey: string;
      readonly casePath: string;
      readonly assuranceCase: AssuranceCase;
    },
    VispError
  >
> {
  const state = await loadProjectState(input);
  if (!state.ok) return state;
  if (state.value.selectedFeature === undefined || state.value.selectedTask === undefined) {
    return err(new VispError("VALIDATION_FAILED", "Review decision requires a feature and task."));
  }
  const casePath = assuranceCaseArtifactPath(
    state.value.targetPath,
    state.value.selectedFeature.key,
    state.value.selectedTask.id
  );
  const assuranceCase = await readArtifact(casePath, assuranceCaseSchema, {
    artifactName: "assurance case"
  });
  if (!assuranceCase.ok) return assuranceCase;
  if (
    assuranceCase.value.featureId !== state.value.selectedFeature.id ||
    assuranceCase.value.featureSlug !== state.value.selectedFeature.slug ||
    assuranceCase.value.taskId !== state.value.selectedTask.id
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Assurance case identity does not match its selected feature, task, and artifact path."
      )
    );
  }
  return ok({
    targetPath: state.value.targetPath,
    featureKey: state.value.selectedFeature.key,
    casePath,
    assuranceCase: assuranceCase.value
  });
}

function pointerFor(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly decision: ReviewDecision;
}): CurrentReviewDecisionPointer {
  return {
    version: "1.0",
    featureId: input.decision.featureId,
    featureSlug: input.decision.featureSlug,
    taskId: input.decision.taskId,
    decisionPath: relativePath(
      input.targetPath,
      reviewDecisionHistoryArtifactPath(
        input.targetPath,
        input.featureKey,
        input.decision.taskId,
        input.decision.decisionHash
      )
    ),
    decisionHash: input.decision.decisionHash,
    updatedAt: input.decision.decidedAt
  };
}

async function writeImmutableDecision(
  historyPath: string,
  decision: ReviewDecision
): Promise<Result<string, VispError>> {
  const serialized = `${JSON.stringify(decision, null, 2)}\n`;
  try {
    await mkdir(path.dirname(historyPath), { recursive: true });
    const handle = await open(historyPath, "wx");
    try {
      await handle.writeFile(serialized, "utf8");
    } finally {
      await handle.close();
    }
    return ok(historyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      return err(toVispError(error, "FILE_SYSTEM_ERROR"));
    }
    const existing = await readArtifact(historyPath, reviewDecisionSchema, {
      artifactName: "review decision history"
    });
    if (!existing.ok) return existing;
    return canonicalJsonV1(existing.value) === canonicalJsonV1(decision)
      ? ok(historyPath)
      : err(
          new VispError(
            "VALIDATION_FAILED",
            "Content-addressed review decision history already contains different content."
          )
        );
  }
}

async function writeAtomicPointer(
  pointerPath: string,
  pointer: CurrentReviewDecisionPointer,
  expectedPointerRaw: string | undefined
): Promise<Result<string, VispError>> {
  const parsed = currentReviewDecisionPointerSchema.safeParse(pointer);
  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Invalid review decision pointer: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
      )
    );
  }
  const tempPath = path.join(
    path.dirname(pointerPath),
    `.${path.basename(pointerPath)}.${process.pid}.${randomUUID()}.tmp`
  );
  const lockPath = `${pointerPath}.lock`;
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await mkdir(path.dirname(pointerPath), { recursive: true });
    lock = await open(lockPath, "wx");
    const currentExists = await pathExists(pointerPath);
    if (!currentExists.ok) return currentExists;
    const currentRaw = currentExists.value ? await readTextFile(pointerPath) : ok(undefined);
    if (!currentRaw.ok) return currentRaw;
    if (currentRaw.value !== expectedPointerRaw) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          "Current review decision pointer changed concurrently; retry the command."
        )
      );
    }
    const handle = await open(tempPath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
    } finally {
      await handle.close();
    }
    await rename(tempPath, pointerPath);
    return ok(pointerPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          "Another review decision pointer update is in progress; retry the command."
        )
      );
    }
    return err(toVispError(error, "FILE_SYSTEM_ERROR"));
  } finally {
    await lock?.close().catch(() => undefined);
    if (lock !== undefined) await rm(lockPath, { force: true }).catch(() => undefined);
  }
}

async function pointerRaw(pointerPath: string): Promise<Result<string | undefined, VispError>> {
  const exists = await pathExists(pointerPath);
  if (!exists.ok) return exists;
  if (!exists.value) return ok(undefined);
  return readTextFile(pointerPath);
}

type DecisionHistoryGraph = {
  readonly terminal?: ReviewDecision;
  readonly decisions: ReadonlyMap<string, ReviewDecision>;
};

async function loadDecisionHistoryGraph(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly featureId: string;
  readonly featureSlug: string;
  readonly taskId: string;
}): Promise<Result<DecisionHistoryGraph, VispError>> {
  const historyDir = reviewDecisionHistoryDir(input.targetPath, input.featureKey, input.taskId);
  let names: string[];
  try {
    names = (await readdir(historyDir)).sort(compareUtf16CodeUnits);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? ok({ decisions: new Map() })
      : err(toVispError(error, "FILE_SYSTEM_ERROR"));
  }
  const decisions = new Map<string, ReviewDecision>();
  for (const name of names) {
    const digest = /^([a-f0-9]{64})\.json$/u.exec(name)?.[1];
    if (digest === undefined) {
      return err(
        new VispError("VALIDATION_FAILED", `Invalid review decision history filename: ${name}.`)
      );
    }
    const decision = await readArtifact(path.join(historyDir, name), reviewDecisionSchema, {
      artifactName: "review decision history"
    });
    if (!decision.ok) return decision;
    if (
      decision.value.decisionHash !== `sha256:${digest}` ||
      decision.value.featureId !== input.featureId ||
      decision.value.featureSlug !== input.featureSlug ||
      decision.value.taskId !== input.taskId
    ) {
      return err(
        new VispError("VALIDATION_FAILED", "Review decision history identity is invalid.")
      );
    }
    decisions.set(decision.value.decisionHash, decision.value);
  }
  if (decisions.size === 0) return ok({ decisions });
  const referenced = new Set<string>();
  for (const decision of decisions.values()) {
    const previous = decision.supersedesDecisionHash;
    if (previous === null) continue;
    if (!decisions.has(previous)) {
      return err(
        new VispError("VALIDATION_FAILED", "Review decision history has a missing predecessor.")
      );
    }
    if (referenced.has(previous)) {
      return err(new VispError("VALIDATION_FAILED", "Review decision history contains a fork."));
    }
    referenced.add(previous);
    const predecessor = decisions.get(previous)!;
    if (Date.parse(predecessor.decidedAt) >= Date.parse(decision.decidedAt)) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          "Superseded review decisions must be older than their successor."
        )
      );
    }
  }
  const terminals = [...decisions.values()].filter(
    (decision) => !referenced.has(decision.decisionHash)
  );
  if (terminals.length !== 1) {
    return err(
      new VispError("VALIDATION_FAILED", "Review decision history has multiple terminal decisions.")
    );
  }
  const visited = new Set<string>();
  let cursor: ReviewDecision | undefined = terminals[0];
  while (cursor !== undefined) {
    if (visited.has(cursor.decisionHash)) {
      return err(new VispError("VALIDATION_FAILED", "Review decision history is cyclic."));
    }
    visited.add(cursor.decisionHash);
    cursor =
      cursor.supersedesDecisionHash === null
        ? undefined
        : decisions.get(cursor.supersedesDecisionHash);
  }
  if (visited.size !== decisions.size) {
    return err(
      new VispError("VALIDATION_FAILED", "Review decision history is disconnected or cyclic.")
    );
  }
  return ok({ terminal: terminals[0], decisions });
}

async function loadCurrentDecision(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly featureId: string;
  readonly featureSlug: string;
  readonly taskId: string;
}): Promise<Result<ReviewDecision | undefined, VispError>> {
  const graph = await loadDecisionHistoryGraph(input);
  if (!graph.ok) return graph;
  const pointerPath = currentReviewDecisionArtifactPath(
    input.targetPath,
    input.featureKey,
    input.taskId
  );
  const exists = await pathExists(pointerPath);
  if (!exists.ok) return exists;
  if (!exists.value) {
    return graph.value.terminal === undefined
      ? ok(undefined)
      : err(
          new VispError(
            "VALIDATION_FAILED",
            "Review decision pointer is missing while valid history exists; run visp assurance repair."
          )
        );
  }
  const pointer = await readArtifact(pointerPath, currentReviewDecisionPointerSchema, {
    artifactName: "review decision pointer"
  });
  if (!pointer.ok) return pointer;
  const expectedHistoryPath = reviewDecisionHistoryArtifactPath(
    input.targetPath,
    input.featureKey,
    input.taskId,
    pointer.value.decisionHash
  );
  if (
    pointer.value.featureId !== input.featureId ||
    pointer.value.featureSlug !== input.featureSlug ||
    pointer.value.taskId !== input.taskId ||
    pointer.value.decisionPath !== relativePath(input.targetPath, expectedHistoryPath)
  ) {
    return err(new VispError("VALIDATION_FAILED", "Review decision pointer identity is invalid."));
  }
  const decision = await readArtifact(expectedHistoryPath, reviewDecisionSchema, {
    artifactName: "review decision history"
  });
  if (!decision.ok) return decision;
  if (
    decision.value.decisionHash !== pointer.value.decisionHash ||
    decision.value.featureId !== input.featureId ||
    decision.value.featureSlug !== input.featureSlug ||
    decision.value.taskId !== input.taskId ||
    pointer.value.updatedAt !== decision.value.decidedAt
  ) {
    return err(new VispError("VALIDATION_FAILED", "Review decision history identity is invalid."));
  }
  if (graph.value.terminal?.decisionHash !== decision.value.decisionHash) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Review decision pointer does not reference the unique terminal history decision; run visp assurance repair."
      )
    );
  }
  return ok(decision.value);
}

async function validateSupersessionChain(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly decision: ReviewDecision;
}): Promise<Result<void, VispError>> {
  const seen = new Set<string>([input.decision.decisionHash]);
  let previous = input.decision.supersedesDecisionHash;
  let newerDecidedAt = input.decision.decidedAt;
  while (previous !== null) {
    if (seen.has(previous)) {
      return err(new VispError("VALIDATION_FAILED", "Review decision supersession is cyclic."));
    }
    seen.add(previous);
    const previousPath = reviewDecisionHistoryArtifactPath(
      input.targetPath,
      input.featureKey,
      input.decision.taskId,
      previous
    );
    const read = await readArtifact(previousPath, reviewDecisionSchema, {
      artifactName: "superseded review decision"
    });
    if (!read.ok) return read;
    if (
      read.value.decisionHash !== previous ||
      read.value.featureId !== input.decision.featureId ||
      read.value.featureSlug !== input.decision.featureSlug ||
      read.value.taskId !== input.decision.taskId
    ) {
      return err(
        new VispError("VALIDATION_FAILED", "Superseded review decision identity is invalid.")
      );
    }
    if (Date.parse(read.value.decidedAt) >= Date.parse(newerDecidedAt)) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          "Superseded review decisions must be older than their successor."
        )
      );
    }
    newerDecidedAt = read.value.decidedAt;
    previous = read.value.supersedesDecisionHash;
  }
  return ok(undefined);
}

async function currentCodeMatches(input: {
  readonly targetPath: string;
  readonly decision: ReviewDecision;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<boolean, VispError>> {
  const snapshot = await captureDiffSnapshot({
    targetPath: input.targetPath,
    mode: input.decision.codeState.mode,
    baseRevision: input.decision.codeState.baseRevision,
    targetRevision:
      input.decision.codeState.mode === "base_to_commit"
        ? input.decision.codeState.targetRevision
        : undefined,
    commandRunner: input.commandRunner
  });
  if (!snapshot.ok) return snapshot;
  if (input.decision.codeState.mode === "base_to_commit") {
    const runner = input.commandRunner ?? defaultCommandRunner;
    const head = await runner.run("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
      cwd: input.targetPath
    });
    if (!head.ok || head.value.stdout.trim() !== input.decision.codeState.targetRevision) {
      return ok(false);
    }
    const status = await runner.run(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      {
        cwd: input.targetPath
      }
    );
    if (!status.ok) return status;
    const fields = status.value.stdout.split("\0").filter(Boolean);
    const nonGenerated = fields.some((field) => {
      const rawPath = field.slice(3);
      const candidatePath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1)! : rawPath;
      return !isGeneratedVispReviewFile(candidatePath);
    });
    if (nonGenerated) return ok(false);
  }
  const stored = await readArtifact(
    resolvePath(
      input.targetPath,
      input.decision.freshnessInputs.find((item) => item.label === "binding:diff_snapshot")?.path ??
        ""
    ),
    diffSnapshotSchema,
    { artifactName: "stored diff snapshot" }
  );
  if (!stored.ok) return stored;
  return ok(
    stored.value.mode === snapshot.value.mode &&
      stored.value.baseRevision === snapshot.value.baseRevision &&
      stored.value.targetRevision === snapshot.value.targetRevision &&
      stored.value.state.headRevision === snapshot.value.state.headRevision &&
      stored.value.state.indexTreeRevision === snapshot.value.state.indexTreeRevision &&
      codeIdentity(stored.value) === codeIdentity(snapshot.value)
  );
}

export async function evaluateCurrentReviewDecision(input: {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId: string;
  readonly commandRunner?: CommandRunner;
  readonly now?: string;
}): Promise<Result<ReviewDecisionCurrentness, VispError>> {
  const loaded = await loadCase(input);
  if (!loaded.ok) {
    return ok({
      status: loaded.error.code === "FILE_NOT_FOUND" ? "missing" : "invalid",
      reason: loaded.error.message
    });
  }
  const assuranceCase = loaded.value.assuranceCase;
  const current = await loadCurrentDecision({
    targetPath: loaded.value.targetPath,
    featureKey: loaded.value.featureKey,
    featureId: assuranceCase.featureId,
    featureSlug: assuranceCase.featureSlug,
    taskId: assuranceCase.taskId
  });
  if (!current.ok) {
    return ok({
      status: "invalid",
      reason: current.error.message,
      caseHash: assuranceCase.caseHash
    });
  }
  if (current.value === undefined) {
    return ok({
      status: "missing",
      reason: "No review decision is recorded.",
      caseHash: assuranceCase.caseHash
    });
  }
  const decision = current.value;
  const chain = await validateSupersessionChain({
    targetPath: loaded.value.targetPath,
    featureKey: loaded.value.featureKey,
    decision
  });
  if (!chain.ok) return ok({ status: "invalid", reason: chain.error.message });
  const policyBinding = assuranceCase.bindings.find((binding) => binding.role === "policy");
  const knownHotspots = new Set(assuranceCase.hotspots.map((hotspot) => hotspot.id));
  if (
    decision.assuranceCase.path !== relativePath(loaded.value.targetPath, loaded.value.casePath) ||
    decision.assuranceCase.sha256 !== assuranceCase.caseHash ||
    decision.assuranceProfile !== assuranceCase.assuranceProfile ||
    policyBinding?.status !== "available" ||
    decision.policy.path !== policyBinding.path ||
    decision.policy.sha256 !== policyBinding.sha256 ||
    decision.codeState.mode !== assuranceCase.diff.mode ||
    decision.codeState.baseRevision !== assuranceCase.diff.baseRevision ||
    decision.codeState.targetRevision !== assuranceCase.diff.targetRevision ||
    decision.codeState.snapshotSha256 !== assuranceCase.diff.snapshotSha256 ||
    decision.codeState.stateSha256 !== assuranceCase.diff.stateSha256 ||
    decision.reviewedHotspotIds.some((id) => !knownHotspots.has(id)) ||
    (decision.decision === "accept" &&
      assuranceCase.hotspots
        .filter((hotspot) => hotspot.mandatory)
        .some((hotspot) => !decision.reviewedHotspotIds.includes(hotspot.id)))
  ) {
    return ok({
      status: "invalid",
      reason: "Review decision does not match the authoritative assurance case.",
      caseHash: assuranceCase.caseHash,
      decisionHash: decision.decisionHash
    });
  }
  const freshness = await captureFreshnessInputs({
    targetPath: loaded.value.targetPath,
    featureKey: loaded.value.featureKey,
    taskId: assuranceCase.taskId,
    assuranceCase
  });
  if (!freshness.ok) return ok({ status: "stale", reason: freshness.error.message });
  if (canonicalJsonV1(freshness.value) !== canonicalJsonV1(decision.freshnessInputs)) {
    return ok({
      status: "stale",
      reason: "Material assurance inputs changed after the review decision.",
      caseHash: assuranceCase.caseHash,
      decisionHash: decision.decisionHash
    });
  }
  const reconstructed = await validateReconstructedAssuranceInputs({
    targetPath: loaded.value.targetPath,
    featureKey: loaded.value.featureKey,
    taskId: assuranceCase.taskId,
    assuranceCase,
    now: input.now,
    commandRunner: input.commandRunner
  });
  if (!reconstructed.ok) {
    return ok({
      status: "stale",
      reason: reconstructed.error.message,
      caseHash: assuranceCase.caseHash,
      decisionHash: decision.decisionHash
    });
  }
  const codeMatches = await currentCodeMatches({
    targetPath: loaded.value.targetPath,
    decision,
    commandRunner: input.commandRunner
  });
  if (!codeMatches.ok || !codeMatches.value) {
    return ok({
      status: "stale",
      reason: codeMatches.ok
        ? "Code state changed after the review decision."
        : codeMatches.error.message,
      caseHash: assuranceCase.caseHash,
      decisionHash: decision.decisionHash
    });
  }
  return ok({
    status: decision.decision === "reject" ? "rejected" : "current",
    reason:
      decision.decision === "reject"
        ? "The current review decision rejects this assurance case."
        : "The current review decision accepts this assurance case.",
    caseHash: assuranceCase.caseHash,
    decisionHash: decision.decisionHash,
    decision
  });
}

export async function evaluateReviewDecisionRequirement(input: {
  readonly targetPath: string;
  readonly feature?: string;
  readonly taskId: string;
  readonly enabled: boolean;
  readonly commandRunner?: CommandRunner;
  readonly now?: string;
}): Promise<Result<ReviewDecisionRequirement, VispError>> {
  const loaded = await loadCase(input);
  const currentness = await evaluateCurrentReviewDecision(input);
  if (!currentness.ok) return currentness;
  if (!input.enabled) {
    return ok({ required: false, currentness: currentness.value });
  }
  if (!loaded.ok) {
    return ok({ required: true, currentness: currentness.value });
  }
  const assuranceCase = loaded.value.assuranceCase;
  const required =
    assuranceCase.assuranceProfile === "behavioral" ||
    assuranceCase.assuranceProfile === "critical" ||
    assuranceCase.hotspots.some((hotspot) => hotspot.mandatory) ||
    assuranceCase.claims.some(
      (claim) => claim.priority === "must" && claim.disposition === "unresolved"
    ) ||
    assuranceCase.evidenceComparisons.some(
      (comparison) =>
        comparison.conclusion === "inconclusive" ||
        comparison.baseline.uncertainty.status !== "none" ||
        comparison.candidate.uncertainty.status !== "none"
    ) ||
    assuranceCase.overrides.length > 0;
  return ok({ required, currentness: currentness.value });
}

export async function runReviewDecisionRepair(input: {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId: string;
  readonly dryRun?: boolean;
}): Promise<Result<ReviewDecisionRepairSummary, VispError>> {
  const loaded = await loadCase(input);
  if (!loaded.ok) return loaded;
  const assuranceCase = loaded.value.assuranceCase;
  const graph = await loadDecisionHistoryGraph({
    targetPath: loaded.value.targetPath,
    featureKey: loaded.value.featureKey,
    featureId: assuranceCase.featureId,
    featureSlug: assuranceCase.featureSlug,
    taskId: assuranceCase.taskId
  });
  if (!graph.ok) return graph;
  if (graph.value.terminal === undefined) {
    return err(
      new VispError("VALIDATION_FAILED", "No review decision history exists to repair the pointer.")
    );
  }
  const pointerPath = currentReviewDecisionArtifactPath(
    loaded.value.targetPath,
    loaded.value.featureKey,
    assuranceCase.taskId
  );
  const expected = await pointerRaw(pointerPath);
  if (!expected.ok) return expected;
  if (!(input.dryRun ?? false)) {
    const repaired = await writeAtomicPointer(
      pointerPath,
      pointerFor({
        targetPath: loaded.value.targetPath,
        featureKey: loaded.value.featureKey,
        decision: graph.value.terminal
      }),
      expected.value
    );
    if (!repaired.ok) return repaired;
  }
  return ok({
    success: true,
    taskId: assuranceCase.taskId,
    decisionHash: graph.value.terminal.decisionHash,
    pointerPath: relativePath(loaded.value.targetPath, pointerPath),
    dryRun: input.dryRun ?? false,
    nextCommand: "visp gate pr"
  });
}

export async function runReviewDecisionWorkflow(
  options: ReviewDecisionWorkflowOptions
): Promise<Result<ReviewDecisionWorkflowSummary, VispError>> {
  const reviewerId = options.reviewerId?.trim();
  const reason = options.reason?.trim();
  if (reviewerId === undefined || reviewerId.length === 0) {
    return err(new VispError("VALIDATION_FAILED", "Review decision requires --reviewer <id>."));
  }
  if (reason === undefined || reason.length < 12 || reason !== options.reason) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Review decision reason must be trimmed and at least 12 characters."
      )
    );
  }
  const effectiveNow = options.now ?? new Date().toISOString();
  const loaded = await loadCase(options);
  if (!loaded.ok) return loaded;
  const assuranceCase = loaded.value.assuranceCase;
  const reconstructed = await validateReconstructedAssuranceInputs({
    targetPath: loaded.value.targetPath,
    featureKey: loaded.value.featureKey,
    taskId: assuranceCase.taskId,
    assuranceCase,
    now: effectiveNow,
    commandRunner: options.commandRunner
  });
  if (!reconstructed.ok) return reconstructed;
  const requestedHotspots = [...(options.reviewedHotspotIds ?? [])].sort(compareUtf16CodeUnits);
  if (new Set(requestedHotspots).size !== requestedHotspots.length) {
    return err(new VispError("VALIDATION_FAILED", "Reviewed hotspot IDs must be unique."));
  }
  const knownHotspots = new Set(assuranceCase.hotspots.map((hotspot) => hotspot.id));
  const unknown = requestedHotspots.filter((id) => !knownHotspots.has(id));
  if (unknown.length > 0) {
    return err(
      new VispError("VALIDATION_FAILED", `Unknown reviewed hotspot: ${unknown.join(", ")}.`)
    );
  }
  if (
    options.decision === "accept" &&
    assuranceCase.hotspots
      .filter((hotspot) => hotspot.mandatory)
      .some((hotspot) => !requestedHotspots.includes(hotspot.id))
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Accepting an assurance case requires acknowledging every mandatory hotspot."
      )
    );
  }
  const policyBinding = assuranceCase.bindings.find((binding) => binding.role === "policy");
  if (policyBinding?.status !== "available") {
    return err(new VispError("VALIDATION_FAILED", "Current policy binding is unavailable."));
  }
  const pointerPath = currentReviewDecisionArtifactPath(
    loaded.value.targetPath,
    loaded.value.featureKey,
    assuranceCase.taskId
  );
  const initialPointerRaw = await pointerRaw(pointerPath);
  if (!initialPointerRaw.ok) return initialPointerRaw;
  const previous = await loadCurrentDecision({
    targetPath: loaded.value.targetPath,
    featureKey: loaded.value.featureKey,
    featureId: assuranceCase.featureId,
    featureSlug: assuranceCase.featureSlug,
    taskId: assuranceCase.taskId
  });
  if (!previous.ok) return previous;
  const decidedAt = effectiveNow;
  if (
    previous.value !== undefined &&
    Date.parse(decidedAt) <= Date.parse(previous.value.decidedAt)
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "A successor review decision must be decided strictly after the current decision."
      )
    );
  }
  const freshness = await captureFreshnessInputs({
    targetPath: loaded.value.targetPath,
    featureKey: loaded.value.featureKey,
    taskId: assuranceCase.taskId,
    assuranceCase
  });
  if (!freshness.ok) return freshness;
  const withoutHash = {
    version: "1.0" as const,
    featureId: assuranceCase.featureId,
    featureSlug: assuranceCase.featureSlug,
    taskId: assuranceCase.taskId,
    assuranceProfile: assuranceCase.assuranceProfile,
    reviewerId,
    identityAssurance: "self_declared" as const,
    decision: options.decision,
    reason,
    reviewedHotspotIds: requestedHotspots,
    assuranceCase: {
      path: relativePath(loaded.value.targetPath, loaded.value.casePath),
      sha256: assuranceCase.caseHash
    },
    codeState: {
      mode: assuranceCase.diff.mode,
      baseRevision: assuranceCase.diff.baseRevision,
      targetRevision: assuranceCase.diff.targetRevision,
      snapshotSha256: assuranceCase.diff.snapshotSha256,
      stateSha256: assuranceCase.diff.stateSha256
    },
    policy: {
      path: policyBinding.path,
      sha256: policyBinding.sha256
    },
    freshnessInputs: [...freshness.value],
    supersedesDecisionHash: previous.value?.decisionHash ?? null,
    decidedAt
  };
  const candidate = {
    ...withoutHash,
    decisionHash: createReviewDecisionHash(withoutHash)
  };
  const parsed = reviewDecisionSchema.safeParse(candidate);
  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Invalid review decision: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
      )
    );
  }
  const historyPath = reviewDecisionHistoryArtifactPath(
    loaded.value.targetPath,
    loaded.value.featureKey,
    assuranceCase.taskId,
    parsed.data.decisionHash
  );
  const after = await captureFreshnessInputs({
    targetPath: loaded.value.targetPath,
    featureKey: loaded.value.featureKey,
    taskId: assuranceCase.taskId,
    assuranceCase
  });
  if (!after.ok) return after;
  if (canonicalJsonV1(after.value) !== canonicalJsonV1(freshness.value)) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Material assurance inputs changed before the review decision pointer could be published."
      )
    );
  }
  const afterCase = await loadCase(options);
  if (
    !afterCase.ok ||
    afterCase.value.assuranceCase.caseHash !== assuranceCase.caseHash ||
    canonicalJsonV1(afterCase.value.assuranceCase) !== canonicalJsonV1(assuranceCase)
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Assurance case changed before the review decision pointer could be published."
      )
    );
  }
  const afterReconstructed = await validateReconstructedAssuranceInputs({
    targetPath: loaded.value.targetPath,
    featureKey: loaded.value.featureKey,
    taskId: assuranceCase.taskId,
    assuranceCase,
    now: effectiveNow,
    commandRunner: options.commandRunner
  });
  if (!afterReconstructed.ok) return afterReconstructed;
  const codeMatches = await currentCodeMatches({
    targetPath: loaded.value.targetPath,
    decision: parsed.data,
    commandRunner: options.commandRunner
  });
  if (!codeMatches.ok || !codeMatches.value) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        codeMatches.ok
          ? "Code state changed before the review decision pointer could be published."
          : codeMatches.error.message
      )
    );
  }
  if (!(options.dryRun ?? false)) {
    const historyExisted = await pathExists(historyPath);
    if (!historyExisted.ok) return historyExisted;
    const history = await writeImmutableDecision(historyPath, parsed.data);
    if (!history.ok) return history;
    const pointer = pointerFor({
      targetPath: loaded.value.targetPath,
      featureKey: loaded.value.featureKey,
      decision: parsed.data
    });
    const written = await writeAtomicPointer(pointerPath, pointer, initialPointerRaw.value);
    if (!written.ok) {
      if (!historyExisted.value) await rm(historyPath, { force: true }).catch(() => undefined);
      return written;
    }
  }
  return ok({
    success: true,
    taskId: assuranceCase.taskId,
    decision: options.decision,
    decisionHash: parsed.data.decisionHash,
    caseHash: assuranceCase.caseHash,
    snapshotHash: assuranceCase.diff.snapshotSha256,
    stateHash: assuranceCase.diff.stateSha256,
    historyPath: relativePath(loaded.value.targetPath, historyPath),
    pointerPath: relativePath(loaded.value.targetPath, pointerPath),
    dryRun: options.dryRun ?? false,
    nextCommand: "visp gate pr"
  });
}
