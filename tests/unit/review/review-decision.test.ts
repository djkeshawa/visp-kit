import { describe, expect, it } from "vitest";

import {
  currentReviewDecisionPointerSchema,
  reviewDecisionSchema,
  type ReviewDecisionWithoutHash
} from "../../../src/artifacts/schemas/review-decision.schema.js";
import {
  createReviewDecisionHash,
  reviewDecisionHashDomain
} from "../../../src/review/review-decision-hash.js";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

function decision(): ReviewDecisionWithoutHash {
  return {
    version: "1.0",
    featureId: "F001",
    featureSlug: "review-decisions",
    taskId: "T001",
    assuranceProfile: "behavioral",
    reviewerId: "reviewer",
    identityAssurance: "self_declared",
    decision: "accept",
    reason: "All mandatory hotspots reviewed.",
    reviewedHotspotIds: ["HS001", "HS002"],
    assuranceCase: {
      path: ".visp/features/001-review/assurance/T001/assurance-case.json",
      sha256: sha("a")
    },
    codeState: {
      mode: "base_to_workspace",
      baseRevision: "0123456789abcdef0123456789abcdef01234567",
      targetRevision: "WORKSPACE",
      snapshotSha256: sha("b"),
      stateSha256: sha("c")
    },
    policy: {
      path: ".visp/policy.json",
      sha256: sha("d")
    },
    freshnessInputs: [
      {
        label: "binding:policy",
        path: ".visp/policy.json",
        status: "available",
        sha256: sha("e")
      },
      {
        label: "override_store",
        path: ".visp/overrides.json",
        status: "missing"
      }
    ],
    supersedesDecisionHash: null,
    decidedAt: "2026-07-25T00:00:00.000Z"
  };
}

describe("review decision schemas", () => {
  it("uses the domain-separated canonical hash and rejects recomputed semantic violations", () => {
    expect(reviewDecisionHashDomain).toBe("visp.review-decision\0canonical-1.0\0");
    const value = decision();
    const signed = { ...value, decisionHash: createReviewDecisionHash(value) };
    expect(reviewDecisionSchema.safeParse(signed).success).toBe(true);
    expect(
      reviewDecisionSchema.safeParse({
        ...signed,
        reason: "short",
        decisionHash: createReviewDecisionHash({ ...value, reason: "short" })
      }).success
    ).toBe(false);
    const unsorted = {
      ...value,
      reviewedHotspotIds: ["HS002", "HS001"]
    };
    expect(
      reviewDecisionSchema.safeParse({
        ...unsorted,
        decisionHash: createReviewDecisionHash(unsorted)
      }).success
    ).toBe(false);
  });

  it("keeps the current pointer strict and content-addressed", () => {
    expect(
      currentReviewDecisionPointerSchema.safeParse({
        version: "1.0",
        featureId: "F001",
        featureSlug: "review-decisions",
        taskId: "T001",
        decisionPath: `.visp/features/001-review/assurance/T001/review-decisions/${"a".repeat(64)}.json`,
        decisionHash: sha("a"),
        updatedAt: "2026-07-25T00:00:00.000Z"
      }).success
    ).toBe(true);
    expect(
      currentReviewDecisionPointerSchema.safeParse({
        version: "1.0",
        featureId: "F001",
        featureSlug: "review-decisions",
        taskId: "T001",
        decisionPath: "../unsafe.json",
        decisionHash: sha("a"),
        updatedAt: "2026-07-25T00:00:00.000Z"
      }).success
    ).toBe(false);
  });
});
