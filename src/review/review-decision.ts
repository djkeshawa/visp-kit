import { computeAssuranceDelta, type AssuranceDelta } from "../assurance/assurance-delta.js";

import {
  assuranceCaseArtifactPath,
  currentReviewDecisionArtifactPath,
  reviewDecisionHistoryArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import {
  assuranceCaseSchema,
  type AssuranceCase
} from "../artifacts/schemas/assurance-case.schema.js";
import {
  diffSnapshotSchema,
  type DiffSnapshot
} from "../artifacts/schemas/diff-snapshot.schema.js";
import {
  reviewDecisionSchema,
  type ReviewDecision,
  type ReviewDecisionStatus
} from "../artifacts/schemas/review-decision.schema.js";
import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { relativePath, resolvePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { canonicalJsonV1, compareUtf16CodeUnits } from "../integration/canonical-json.js";
import { loadProjectState } from "../orchestrator/project-state.js";
import { createReviewDecisionHash } from "./review-decision-hash.js";
import { signDecisionHash, verifyDecisionSignature } from "./review-decision-signature.js";
import { captureDiffSnapshot } from "../assurance/diff-snapshot.js";
import { isGeneratedVispReviewFile } from "./diff-summary.js";
import {
  captureFreshnessInputs,
  codeIdentity,
  validateReconstructedAssuranceInputs
} from "./review-decision-freshness.js";
import {
  loadCurrentDecision,
  loadDecisionHistoryGraph,
  validateSupersessionChain
} from "./review-decision-history.js";
import {
  pointerFor,
  pointerRaw,
  publishDecisionAndPointer,
  writeAtomicPointer
} from "./review-decision-store.js";

type LoadedReviewCase = {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly casePath: string;
  readonly assuranceCase: AssuranceCase;
};

export type ReviewDecisionCurrentness = {
  readonly status: ReviewDecisionStatus;
  readonly reason: string;
  readonly caseHash?: string;
  readonly decisionHash?: string;
  readonly decision?: ReviewDecision;
  /**
   * What moved since the decision, when it is no longer current.
   *
   * Present only for `invalid` and `stale`; a current decision has nothing to
   * report. `reason` says that something changed, this says what.
   */
  readonly delta?: AssuranceDelta;
};

/**
 * Builds the delta between a decision and the state the assurance case now
 * describes.
 *
 * The current values are read from the authoritative assurance case rather
 * than recomputed, so the delta reports the same state the currentness check
 * just compared against and the two can never disagree.
 */
function currentAssuranceDelta(input: {
  readonly assuranceCase: {
    readonly diff: ReviewDecision["codeState"];
    readonly bindings: readonly {
      readonly role: string;
      readonly path?: string;
      readonly sha256?: string;
      readonly status: string;
    }[];
  };
  readonly decision: ReviewDecision;
  readonly policyBinding?: {
    readonly path?: string;
    readonly sha256?: string;
    readonly status: string;
  };
  readonly freshnessInputs?: readonly ReviewDecision["freshnessInputs"][number][];
}): AssuranceDelta {
  return computeAssuranceDelta({
    trusted: input.decision,
    current: {
      codeState: input.assuranceCase.diff,
      policy: {
        path: input.policyBinding?.path ?? input.decision.policy.path,
        // A policy binding that is not available cannot be compared by hash, so
        // it is reported as moved rather than silently matching. Falling back
        // to the decision's own hash would make a missing policy look current.
        sha256:
          input.policyBinding?.status === "available" && input.policyBinding.sha256 !== undefined
            ? input.policyBinding.sha256
            : "unavailable"
      },
      freshnessInputs: input.freshnessInputs ?? input.decision.freshnessInputs
    } as never
  });
}

export type ReviewDecisionWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId: string;
  readonly reviewerId?: string;
  readonly reason?: string;
  readonly reviewedHotspotIds?: readonly string[];
  readonly decision: "accept" | "reject";
  /**
   * SSH private key used to sign the decision hash. Without it the decision is
   * recorded as `self_declared`: the reviewer ID is whatever the caller typed.
   */
  readonly signKeyPath?: string;
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
  readonly caseHash?: string;
  readonly currentness: ReviewDecisionCurrentness;
};

async function loadCase(input: {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId: string;
}): Promise<Result<LoadedReviewCase, VispError>> {
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

/**
 * Does `git status --porcelain=v1 -z` report nothing but files Visp generated?
 *
 * The `-z` format is not the human one. Each entry is `XY <path>` in its own
 * NUL-terminated field, and a rename or copy puts its ORIGINAL path in a second,
 * bare field with no `XY ` prefix — it never uses the ` -> ` spelling that only
 * the non-`-z` output has.
 *
 * Reading every field as `field.slice(3)` therefore chopped three characters off
 * each original path (`src/old.ts` was read as `/old.ts`), which no longer
 * matched the generated-file test. Renaming a generated artifact reported the
 * tree as dirty and invalidated a review decision that was in fact current. The
 * error was in the safe direction, but it was still a wrong answer.
 */
export function isWorkingTreeOnlyGenerated(porcelainZ: string): boolean {
  const fields = porcelainZ.split("\0");
  const paths: string[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === undefined || field.length === 0) continue;

    const status = field.slice(0, 2);
    paths.push(field.slice(3));

    // A rename or copy is followed by its bare original path. Consume it here
    // so the loop never reads it as though it carried a status prefix.
    if (status.startsWith("R") || status.startsWith("C")) {
      const original = fields[index + 1];
      if (original !== undefined && original.length > 0) {
        paths.push(original);
        index += 1;
      }
    }
  }

  return paths.every((candidate) => isGeneratedVispReviewFile(candidate));
}

/**
 * Whether the working tree still matches the state the decision was made
 * against, and the freshly captured snapshot it was compared with.
 *
 * The snapshot is returned so callers can say *what* moved. Recomputing it
 * outside would risk the explanation disagreeing with the verdict.
 */
async function currentCodeMatches(input: {
  readonly targetPath: string;
  readonly decision: ReviewDecision;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<{ readonly matches: boolean; readonly snapshot?: DiffSnapshot }, VispError>> {
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
      return ok({ matches: false, snapshot: snapshot.value });
    }
    const status = await runner.run(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      {
        cwd: input.targetPath
      }
    );
    if (!status.ok) return status;
    if (!isWorkingTreeOnlyGenerated(status.value.stdout)) {
      return ok({ matches: false, snapshot: snapshot.value });
    }
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
  return ok({
    matches:
      stored.value.mode === snapshot.value.mode &&
      stored.value.baseRevision === snapshot.value.baseRevision &&
      stored.value.targetRevision === snapshot.value.targetRevision &&
      stored.value.state.headRevision === snapshot.value.state.headRevision &&
      stored.value.state.indexTreeRevision === snapshot.value.state.indexTreeRevision &&
      codeIdentity(stored.value) === codeIdentity(snapshot.value),
    snapshot: snapshot.value
  });
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
  return evaluateLoadedCurrentReviewDecision(loaded.value, input);
}

async function evaluateLoadedCurrentReviewDecision(
  loaded: LoadedReviewCase,
  input: {
    readonly commandRunner?: CommandRunner;
    readonly now?: string;
  }
): Promise<Result<ReviewDecisionCurrentness, VispError>> {
  const assuranceCase = loaded.assuranceCase;
  const current = await loadCurrentDecision({
    targetPath: loaded.targetPath,
    featureKey: loaded.featureKey,
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
    targetPath: loaded.targetPath,
    featureKey: loaded.featureKey,
    decision
  });
  if (!chain.ok) return ok({ status: "invalid", reason: chain.error.message });
  const policyBinding = assuranceCase.bindings.find((binding) => binding.role === "policy");
  const knownHotspots = new Set(assuranceCase.hotspots.map((hotspot) => hotspot.id));
  if (
    decision.assuranceCase.path !== relativePath(loaded.targetPath, loaded.casePath) ||
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
      decisionHash: decision.decisionHash,
      // Staleness was already detected here; only the fact was reported, never
      // the cause. The reviewer had to re-read the whole case to find out what
      // moved, which is the work the case exists to remove.
      delta: currentAssuranceDelta({ assuranceCase, decision, policyBinding })
    });
  }
  const freshness = await captureFreshnessInputs({
    targetPath: loaded.targetPath,
    featureKey: loaded.featureKey,
    taskId: assuranceCase.taskId,
    assuranceCase
  });
  if (!freshness.ok) return ok({ status: "stale", reason: freshness.error.message });
  if (canonicalJsonV1(freshness.value) !== canonicalJsonV1(decision.freshnessInputs)) {
    return ok({
      status: "stale",
      reason: "Material assurance inputs changed after the review decision.",
      caseHash: assuranceCase.caseHash,
      decisionHash: decision.decisionHash,
      delta: currentAssuranceDelta({
        assuranceCase,
        decision,
        policyBinding,
        freshnessInputs: freshness.value
      })
    });
  }
  const reconstructed = await validateReconstructedAssuranceInputs({
    targetPath: loaded.targetPath,
    featureKey: loaded.featureKey,
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
    targetPath: loaded.targetPath,
    decision,
    commandRunner: input.commandRunner
  });
  if (!codeMatches.ok || !codeMatches.value.matches) {
    return ok({
      status: "stale",
      reason: codeMatches.ok
        ? "Code state changed after the review decision."
        : codeMatches.error.message,
      caseHash: assuranceCase.caseHash,
      decisionHash: decision.decisionHash,
      // The freshly captured snapshot is the only place the *new* code state
      // exists; the assurance case still holds the state the decision matched.
      delta:
        codeMatches.ok && codeMatches.value.snapshot !== undefined
          ? currentAssuranceDelta({
              assuranceCase: {
                diff: {
                  ...assuranceCase.diff,
                  targetRevision: codeMatches.value.snapshot.targetRevision,
                  snapshotSha256: codeMatches.value.snapshot.snapshotSha256
                },
                bindings: assuranceCase.bindings
              },
              decision,
              policyBinding
            })
          : undefined
    });
  }
  // A decision that claims a signature must actually carry an intact one. This
  // runs here rather than in the schema because ssh-keygen is a subprocess and
  // Zod refinements are synchronous; see ADR 0003.
  if (decision.signature !== undefined) {
    const verified = await verifyDecisionSignature({
      decisionHash: decision.decisionHash,
      signature: decision.signature,
      commandRunner: input.commandRunner
    });
    if (!verified.ok || !verified.value.verified) {
      return ok({
        status: "invalid",
        reason: verified.ok
          ? `Review decision signature is not valid. ${verified.value.reason}`
          : `Review decision signature could not be verified. ${verified.error.message}`,
        caseHash: assuranceCase.caseHash,
        decisionHash: decision.decisionHash
      });
    }
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
  if (!loaded.ok) {
    return ok({
      required: input.enabled,
      currentness: {
        status: loaded.error.code === "FILE_NOT_FOUND" ? "missing" : "invalid",
        reason: loaded.error.message
      }
    });
  }
  const assuranceCase = loaded.value.assuranceCase;
  const currentness = await evaluateLoadedCurrentReviewDecision(loaded.value, input);
  if (!currentness.ok) return currentness;
  const required =
    input.enabled &&
    (assuranceCase.assuranceProfile === "behavioral" ||
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
      assuranceCase.overrides.length > 0);
  return ok({
    required,
    caseHash: assuranceCase.caseHash,
    currentness: currentness.value
  });
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
    nextCommand: "visp-kit gate pr"
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
    identityAssurance: (options.signKeyPath === undefined ? "self_declared" : "ssh_signed") as
      | "self_declared"
      | "ssh_signed",
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
  const decisionHash = createReviewDecisionHash(withoutHash);
  // The signature covers `decisionHash`, which already commits to the whole
  // canonical body, and is stored outside it so the content-addressed history
  // filename stays derived from the hash alone.
  const signature =
    options.signKeyPath === undefined
      ? undefined
      : await signDecisionHash({
          decisionHash,
          keyPath: options.signKeyPath,
          signedAt: decidedAt,
          commandRunner: options.commandRunner
        });
  if (signature !== undefined && !signature.ok) return signature;
  const candidate = {
    ...withoutHash,
    decisionHash,
    ...(signature === undefined ? {} : { signature: signature.value })
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
  if (!codeMatches.ok || !codeMatches.value.matches) {
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
    const pointer = pointerFor({
      targetPath: loaded.value.targetPath,
      featureKey: loaded.value.featureKey,
      decision: parsed.data
    });
    const published = await publishDecisionAndPointer({
      historyPath,
      decision: parsed.data,
      pointerPath,
      pointer,
      expectedPointerRaw: initialPointerRaw.value
    });
    if (!published.ok) return published;
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
    nextCommand: "visp-kit gate pr"
  });
}
