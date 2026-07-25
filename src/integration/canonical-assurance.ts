import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { assuranceCaseArtifactPath } from "../artifacts/artifact-paths.js";
import {
  assuranceCaseSchema,
  type AssuranceCase
} from "../artifacts/schemas/assurance-case.schema.js";
import { pathExists } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { loadEffectivePolicy } from "../policy/policy-loader.js";
import { evaluateReviewDecisionRequirement } from "../review/review-decision.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { compareUtf16CodeUnits, type Sha256Hash } from "./canonical-json.js";
import { type CanonicalAssuranceSummary } from "./canonical-workflow-action.js";

function unavailable(input: {
  readonly reason: string;
  readonly required: boolean;
  readonly status: "current" | "missing" | "rejected" | "stale" | "invalid";
  readonly reviewReason: string;
}): CanonicalAssuranceSummary {
  return {
    state: "unavailable",
    reason: input.reason,
    reviewDecision: {
      required: input.required,
      status: input.status,
      decisionHash: null,
      reason: input.reviewReason
    }
  };
}

function hotspotComparator(
  left: AssuranceCase["hotspots"][number],
  right: AssuranceCase["hotspots"][number]
): number {
  for (const [leftValue, rightValue] of [
    [left.id, right.id],
    [left.category, right.category],
    [left.severity, right.severity],
    [left.path ?? "", right.path ?? ""],
    [left.reason, right.reason]
  ] as const) {
    const compared = compareUtf16CodeUnits(leftValue, rightValue);
    if (compared !== 0) return compared;
  }
  return 0;
}

export async function selectCanonicalAssuranceSummary(input: {
  readonly state: ProjectState;
  readonly now: string;
  readonly evaluateRequirement?: typeof evaluateReviewDecisionRequirement;
}): Promise<CanonicalAssuranceSummary> {
  const feature = input.state.selectedFeature;
  const task = input.state.selectedTask;
  if (feature === undefined || task === undefined) {
    return unavailable({
      reason: "Assurance summary requires a selected feature and task.",
      required: false,
      status: "missing",
      reviewReason: "No task-scoped assurance decision can be selected."
    });
  }

  const policy = await loadEffectivePolicy({
    targetPath: input.state.targetPath,
    now: input.now
  });
  if (!policy.ok) {
    return unavailable({
      reason: `Assurance policy is invalid: ${policy.error.message}`,
      required: false,
      status: "invalid",
      reviewReason: "Review-decision requirements cannot be evaluated without valid policy."
    });
  }
  const enabled = policy.value.policy.rules.requireCurrentAssuranceDecisionBeforePr === true;

  const casePath = assuranceCaseArtifactPath(input.state.targetPath, feature.key, task.id);
  const exists = await pathExists(casePath);
  if (!exists.ok) {
    return unavailable({
      reason: exists.error.message,
      required: enabled,
      status: "invalid",
      reviewReason: "The assurance case snapshot could not be inspected."
    });
  }
  if (!exists.value) {
    return unavailable({
      reason: "Assurance case is missing.",
      required: enabled,
      status: "missing",
      reviewReason: "No review decision is recorded."
    });
  }

  let raw: Buffer;
  try {
    raw = await readFile(casePath);
  } catch (error) {
    return unavailable({
      reason: `Assurance case is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      required: enabled,
      status: "invalid",
      reviewReason: "The assurance case snapshot could not be read."
    });
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return unavailable({
      reason: "Assurance case is invalid JSON.",
      required: enabled,
      status: "invalid",
      reviewReason: "Review currentness cannot be evaluated for an invalid assurance case."
    });
  }
  const parsed = assuranceCaseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return unavailable({
      reason: `Assurance case is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}.`,
      required: enabled,
      status: "invalid",
      reviewReason: "Review currentness cannot be evaluated for an invalid assurance case."
    });
  }
  if (
    parsed.data.featureId !== feature.id ||
    parsed.data.featureSlug !== feature.slug ||
    parsed.data.taskId !== task.id
  ) {
    return unavailable({
      reason: "Assurance case identity does not match the selected feature and task.",
      required: enabled,
      status: "invalid",
      reviewReason: "Review currentness cannot be bound to a mismatched assurance case."
    });
  }
  const review = await (input.evaluateRequirement ?? evaluateReviewDecisionRequirement)({
    targetPath: input.state.targetPath,
    feature: feature.key,
    taskId: task.id,
    enabled,
    now: input.now
  });
  if (!review.ok) {
    return unavailable({
      reason: `Assurance decision evaluation failed: ${review.error.message}`,
      required: enabled,
      status: "invalid",
      reviewReason: review.error.message
    });
  }
  if (
    review.value.caseHash !== parsed.data.caseHash ||
    (review.value.currentness.caseHash !== undefined &&
      review.value.currentness.caseHash !== parsed.data.caseHash)
  ) {
    return unavailable({
      reason: "Assurance case changed while review currentness was evaluated.",
      required: review.value.required,
      status: "invalid",
      reviewReason: "Review currentness is not bound to the emitted assurance case snapshot."
    });
  }
  let confirmedRaw: Buffer;
  try {
    confirmedRaw = await readFile(casePath);
  } catch {
    return unavailable({
      reason: "Assurance case became unreadable while review currentness was evaluated.",
      required: review.value.required,
      status: "invalid",
      reviewReason: "Review currentness is not bound to a stable assurance case snapshot."
    });
  }
  if (!confirmedRaw.equals(raw)) {
    return unavailable({
      reason: "Assurance case changed while review currentness was evaluated.",
      required: review.value.required,
      status: "invalid",
      reviewReason: "Review currentness is not bound to the emitted assurance case snapshot."
    });
  }

  return {
    state: "available",
    version: "1.0",
    artifact: {
      path: relativePath(input.state.targetPath, casePath),
      contentHash: `sha256:${createHash("sha256").update(raw).digest("hex")}` as Sha256Hash
    },
    caseHash: parsed.data.caseHash as Sha256Hash,
    verdict: parsed.data.verdict,
    mandatoryHotspots: parsed.data.hotspots
      .filter((hotspot) => hotspot.mandatory)
      .sort(hotspotComparator)
      .map(({ id, category, severity, path, reason }) => ({
        id,
        category,
        severity,
        path,
        reason
      })),
    reviewDecision: {
      required: review.value.required,
      status: review.value.currentness.status,
      decisionHash: (review.value.currentness.decisionHash as Sha256Hash | undefined) ?? null,
      reason: review.value.currentness.reason
    }
  };
}
