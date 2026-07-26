import { z } from "zod";

import { createReviewDecisionHash } from "../../review/review-decision-hash.js";
import { assuranceCasePathSchema } from "./assurance-case.schema.js";
import { idSchema, isoDateTimeSchema, nonEmptyStringSchema } from "./common.schema.js";
import { assuranceProfileSchema } from "./evidence.schema.js";
import { oracleSha256Schema } from "./oracle-plan.schema.js";

export const reviewDecisionFreshnessInputSchema = z.discriminatedUnion("status", [
  z
    .object({
      label: nonEmptyStringSchema,
      path: assuranceCasePathSchema,
      status: z.literal("available"),
      sha256: oracleSha256Schema
    })
    .strict(),
  z
    .object({
      label: nonEmptyStringSchema,
      path: assuranceCasePathSchema,
      status: z.literal("missing")
    })
    .strict(),
  z
    .object({
      label: nonEmptyStringSchema,
      path: assuranceCasePathSchema,
      status: z.literal("invalid"),
      sha256: oracleSha256Schema
    })
    .strict()
]);

const reviewDecisionWithoutHashObjectSchema = z
  .object({
    version: z.literal("1.0"),
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema,
    assuranceProfile: assuranceProfileSchema,
    reviewerId: nonEmptyStringSchema,
    // `self_declared` means the reviewer ID is whatever the caller typed.
    // `ssh_signed` additionally carries a signature over `decisionHash`, which
    // Kit verifies as an intact binding to a key fingerprint. Kit never decides
    // whether that key is authorized to approve; see ADR 0003.
    identityAssurance: z.enum(["self_declared", "ssh_signed"]),
    decision: z.enum(["accept", "reject"]),
    reason: nonEmptyStringSchema,
    reviewedHotspotIds: z.array(idSchema),
    assuranceCase: z
      .object({
        path: assuranceCasePathSchema,
        sha256: oracleSha256Schema
      })
      .strict(),
    codeState: z
      .object({
        mode: z.enum(["base_to_workspace", "base_to_commit"]),
        baseRevision: nonEmptyStringSchema,
        targetRevision: nonEmptyStringSchema,
        snapshotSha256: oracleSha256Schema,
        stateSha256: oracleSha256Schema
      })
      .strict(),
    policy: z
      .object({
        path: assuranceCasePathSchema,
        sha256: oracleSha256Schema
      })
      .strict(),
    freshnessInputs: z.array(reviewDecisionFreshnessInputSchema),
    supersedesDecisionHash: oracleSha256Schema.nullable(),
    decidedAt: isoDateTimeSchema
  })
  .strict();

function validateDecisionSemantics(
  decision: z.infer<typeof reviewDecisionWithoutHashObjectSchema>,
  context: z.RefinementCtx
): void {
  if (decision.reason.trim() !== decision.reason || decision.reason.length < 12) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "Decision reason must be trimmed and at least 12 characters."
    });
  }
  if (decision.reviewerId.trim() !== decision.reviewerId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewerId"],
      message: "Reviewer ID must be trimmed."
    });
  }
  for (const [index, id] of decision.reviewedHotspotIds.entries()) {
    if (index > 0 && decision.reviewedHotspotIds[index - 1]! >= id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewedHotspotIds", index],
        message: "Reviewed hotspot IDs must be sorted and unique."
      });
    }
  }
  for (const [index, input] of decision.freshnessInputs.entries()) {
    const previous = decision.freshnessInputs[index - 1];
    if (
      previous !== undefined &&
      `${previous.label}\0${previous.path}` >= `${input.label}\0${input.path}`
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["freshnessInputs", index],
        message: "Freshness inputs must be sorted and unique by label and path."
      });
    }
  }
}

export const reviewDecisionWithoutHashSchema =
  reviewDecisionWithoutHashObjectSchema.superRefine(validateDecisionSemantics);

/**
 * SSH signature over the decision's `decisionHash`.
 *
 * Deliberately stored outside the hashed body:
 * `reviewDecisionHistoryArtifactPath` derives the content-addressed history
 * filename from `decisionHash`, so folding the signature into the hash would
 * either break that addressing or need a second canonical projection.
 */
export const reviewDecisionSignatureSchema = z
  .object({
    scheme: z.literal("ssh"),
    // `SHA256:<base64>` as reported by `ssh-keygen -Y check-novalidate`.
    keyFingerprint: nonEmptyStringSchema.regex(
      /^SHA256:[A-Za-z0-9+/]{43}$/u,
      "Key fingerprint must be an ssh-keygen SHA256 fingerprint."
    ),
    // Armored `-----BEGIN SSH SIGNATURE-----` block.
    value: nonEmptyStringSchema,
    signedAt: isoDateTimeSchema
  })
  .strict();

export const reviewDecisionSchema = reviewDecisionWithoutHashObjectSchema
  .extend({
    decisionHash: oracleSha256Schema,
    signature: reviewDecisionSignatureSchema.optional()
  })
  .strict()
  .superRefine((decision, context) => {
    validateDecisionSemantics(decision, context);
    const { decisionHash, signature, ...withoutHash } = decision;
    if (decisionHash !== createReviewDecisionHash(withoutHash)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decisionHash"],
        message: "Decision hash does not match canonical decision content."
      });
    }
    // Whether the signature actually verifies is decided asynchronously in
    // `evaluateLoadedCurrentReviewDecision`; Zod refinements are synchronous
    // and every history file is parsed on every read. What the schema can do
    // is refuse a decision whose claimed identity and payload disagree.
    if (decision.identityAssurance === "ssh_signed" && signature === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signature"],
        message: "identityAssurance ssh_signed requires a signature."
      });
    }
    if (decision.identityAssurance === "self_declared" && signature !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["identityAssurance"],
        message: "A signed decision must declare identityAssurance ssh_signed."
      });
    }
  });

export const currentReviewDecisionPointerSchema = z
  .object({
    version: z.literal("1.0"),
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema,
    decisionPath: assuranceCasePathSchema,
    decisionHash: oracleSha256Schema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const reviewDecisionStatusSchema = z.enum([
  "current",
  "missing",
  "rejected",
  "stale",
  "invalid"
]);

export type ReviewDecisionFreshnessInput = z.infer<typeof reviewDecisionFreshnessInputSchema>;
export type ReviewDecisionSignature = z.infer<typeof reviewDecisionSignatureSchema>;
export type ReviewDecisionWithoutHash = z.infer<typeof reviewDecisionWithoutHashSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
export type CurrentReviewDecisionPointer = z.infer<typeof currentReviewDecisionPointerSchema>;
export type ReviewDecisionStatus = z.infer<typeof reviewDecisionStatusSchema>;
