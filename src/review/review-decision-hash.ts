import { createHash } from "node:crypto";

import { type ReviewDecisionWithoutHash } from "../artifacts/schemas/review-decision.schema.js";
import { canonicalJsonV1, type Sha256Hash } from "../integration/canonical-json.js";

export const reviewDecisionHashDomain = "visp.review-decision\0canonical-1.0\0";

export function createReviewDecisionHash(decision: ReviewDecisionWithoutHash): Sha256Hash {
  return `sha256:${createHash("sha256")
    .update(reviewDecisionHashDomain, "utf8")
    .update(canonicalJsonV1(decision), "utf8")
    .digest("hex")}`;
}
