/**
 * The append-only chain of review decisions, and the rules that keep it sound.
 *
 * Decisions supersede one another rather than being edited, so what is on disk
 * is a graph: every decision names the one it replaces. `loadDecisionHistoryGraph`
 * reads that graph, and `validateSupersessionChain` walks it to confirm the
 * pointer's decision really is terminal — that no decision it superseded was
 * itself later superseded by a second, divergent branch.
 *
 * Reading the whole chain matters because trusting the pointer alone would let
 * a fork be presented as the current decision.
 *
 * Extracted from `review-decision.ts`.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  currentReviewDecisionArtifactPath,
  reviewDecisionHistoryDir,
  reviewDecisionHistoryArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import {
  currentReviewDecisionPointerSchema,
  reviewDecisionSchema,
  type ReviewDecision
} from "../artifacts/schemas/review-decision.schema.js";
import { VispError, toVispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { compareUtf16CodeUnits } from "../integration/canonical-json.js";

export type DecisionHistoryGraph = {
  readonly terminal?: ReviewDecision;
  readonly decisions: ReadonlyMap<string, ReviewDecision>;
};

const reviewDecisionTemporaryFilePattern =
  /^\.[a-f0-9]{64}\.json\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/u;

export async function loadDecisionHistoryGraph(input: {
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
      // Exclusive publication hard-links a complete sibling into place before
      // removing the sibling. A crash in that committed two-name window may
      // leave this exact internal residue, which carries no additional
      // decision and must not invalidate the canonical history entry.
      if (reviewDecisionTemporaryFilePattern.test(name)) continue;
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

export async function loadCurrentDecision(input: {
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
            "Review decision pointer is missing while valid history exists; run visp-kit assurance repair."
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
        "Review decision pointer does not reference the unique terminal history decision; run visp-kit assurance repair."
      )
    );
  }
  return ok(decision.value);
}

export async function validateSupersessionChain(input: {
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
