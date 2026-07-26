import { z } from "zod";

import {
  commandStringSchema,
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  requirementPrioritySchema,
  validationMethodSchema
} from "./common.schema.js";
import { assuranceProfileSchema, evidenceProviderIdentitySchema } from "./evidence.schema.js";

export const oracleSha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

export const oracleArtifactBindingSchema = z
  .object({
    path: pathStringSchema,
    sha256: oracleSha256Schema
  })
  .strict();

export const oracleBaseCommitSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("captured"),
      commit: z.string().regex(/^[a-f0-9]{40,64}$/u)
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: nonEmptyStringSchema
    })
    .strict()
]);

const oracleExpectationSchema = z
  .object({
    expected: z.enum(["passed", "failed", "recorded"])
  })
  .strict();

export const oraclePlanOracleSchema = z
  .object({
    id: idSchema,
    requirementId: idSchema,
    acceptanceCriterionId: idSchema,
    description: nonEmptyStringSchema,
    priority: requirementPrioritySchema,
    validationMethod: validationMethodSchema,
    baseline: oracleExpectationSchema,
    candidate: z.object({ expected: z.literal("passed") }).strict()
  })
  .strict();

export const oracleTestStrengthEvidenceSchema = z.discriminatedUnion("independence", [
  z
    .object({
      path: pathStringSchema,
      sha256: oracleSha256Schema,
      independence: z.literal("pre_existing"),
      source: z
        .object({
          kind: z.literal("git_base_commit"),
          commit: z.string().regex(/^[a-f0-9]{40,64}$/u)
        })
        .strict()
    })
    .strict(),
  z
    .object({
      path: pathStringSchema,
      sha256: oracleSha256Schema,
      independence: z.literal("pre_approved"),
      source: z
        .object({
          kind: z.literal("explicit_pre_approval"),
          reference: nonEmptyStringSchema
        })
        .strict()
    })
    .strict(),
  /**
   * The test is this task's own declared deliverable.
   *
   * Test-strength evidence exists to prove the implementer did not author or
   * edit the test to make their change pass. That protection is inapplicable
   * when authoring the test *is* the task: the file necessarily changes, and
   * enforcing its hash deadlocks the workflow.
   *
   * The exemption is narrow and declared in advance. It applies only when the
   * task's `taskClass` is `regression_test` and the path is in that task's own
   * `expectedFiles`, both recorded in the hash-bound task graph before
   * implementation. The hash observed at plan time is still recorded, so the
   * change remains auditable, and the assurance case raises a mandatory hotspot
   * so a reviewer is told the test was self-authored.
   */
  z
    .object({
      path: pathStringSchema,
      sha256: oracleSha256Schema,
      independence: z.literal("task_deliverable"),
      source: z
        .object({
          kind: z.literal("declared_task_deliverable"),
          taskId: nonEmptyStringSchema,
          taskClass: z.literal("regression_test")
        })
        .strict()
    })
    .strict()
]);

export const oraclePlanSchema = z
  .object({
    version: z.literal("1.0"),
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema,
    assuranceProfile: assuranceProfileSchema,
    criticalReviewApproval: z
      .object({
        required: z.boolean(),
        status: z.enum(["not_required", "pending"])
      })
      .strict(),
    oracles: z.array(oraclePlanOracleSchema),
    validationCommands: z.array(commandStringSchema).min(1),
    testStrengthEvidence: z.array(oracleTestStrengthEvidenceSchema),
    bindings: z
      .object({
        policy: oracleArtifactBindingSchema,
        specification: oracleArtifactBindingSchema,
        plan: oracleArtifactBindingSchema,
        taskGraph: oracleArtifactBindingSchema,
        context: oracleArtifactBindingSchema,
        task: z.object({ id: idSchema, sha256: oracleSha256Schema }).strict()
      })
      .strict(),
    baseCommit: oracleBaseCommitSchema,
    requiredProviders: z.array(evidenceProviderIdentitySchema).min(1),
    generatedAt: isoDateTimeSchema
  })
  .strict()
  .superRefine((plan, context) => {
    const oracleIds = new Set<string>();
    const criterionIds = new Set<string>();
    for (const [index, oracle] of plan.oracles.entries()) {
      if (oracleIds.has(oracle.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["oracles", index, "id"],
          message: `Duplicate oracle ID: ${oracle.id}.`
        });
      }
      if (criterionIds.has(oracle.acceptanceCriterionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["oracles", index, "acceptanceCriterionId"],
          message: `Duplicate acceptance criterion: ${oracle.acceptanceCriterionId}.`
        });
      }
      oracleIds.add(oracle.id);
      criterionIds.add(oracle.acceptanceCriterionId);
    }

    if (new Set(plan.validationCommands).size !== plan.validationCommands.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validationCommands"],
        message: "Validation commands must be unique."
      });
    }

    if (
      new Set(plan.requiredProviders.map((provider) => provider.id)).size !==
      plan.requiredProviders.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredProviders"],
        message: "Required provider IDs must be unique."
      });
    }

    const critical = plan.assuranceProfile === "critical";
    if (plan.assuranceProfile !== "routine" && plan.oracles.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["oracles"],
        message: "Behavioral and critical assurance require at least one oracle."
      });
    }

    if (
      plan.criticalReviewApproval.required !== critical ||
      plan.criticalReviewApproval.status !== (critical ? "pending" : "not_required")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criticalReviewApproval"],
        message: "Critical review approval must be pending exactly for critical assurance."
      });
    }
  });

export type OraclePlan = z.infer<typeof oraclePlanSchema>;
export type OraclePlanOracle = z.infer<typeof oraclePlanOracleSchema>;
export type OracleTestStrengthEvidence = z.infer<typeof oracleTestStrengthEvidenceSchema>;
export type OracleArtifactBinding = z.infer<typeof oracleArtifactBindingSchema>;
export type OracleBaseCommitArtifact = z.infer<typeof oracleBaseCommitSchema>;
