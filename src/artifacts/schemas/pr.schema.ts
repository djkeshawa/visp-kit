import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";
import { policyGateSummarySchema } from "./gate.schema.js";
import {
  implementationChecklistItemSchema,
  implementationChecklistStatusSchema
} from "./implementation-checklist.schema.js";
import { budgetUsageStatusSchema } from "./budget.schema.js";
import { reviewChangeTypeSchema } from "./review.schema.js";

export const prStatusSchema = z.enum(["ready", "warnings", "blocked", "missing"]);

export const prRequirementSchema = z
  .object({
    requirementId: idSchema,
    acceptanceCriterionIds: z.array(idSchema),
    status: prStatusSchema
  })
  .strict();

export const prTaskSchema = z
  .object({
    taskId: idSchema,
    title: nonEmptyStringSchema,
    status: nonEmptyStringSchema,
    evidence: stringListSchema
  })
  .strict();

export const prChangedFileSchema = z
  .object({
    path: pathStringSchema,
    changeType: reviewChangeTypeSchema,
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    notes: nonEmptyStringSchema
  })
  .strict();

export const prEvidenceSchema = z
  .object({
    status: prStatusSchema,
    reportPath: pathStringSchema.nullable(),
    summary: stringListSchema
  })
  .strict();

export const prImplementationChecklistSchema = z
  .object({
    status: z.enum(["complete", "incomplete", "missing"]),
    pendingRequiredIds: z.array(idSchema),
    blockedRequiredIds: z.array(idSchema),
    usageStatus: z.union([implementationChecklistStatusSchema, z.literal("not_recorded")]),
    items: z.array(implementationChecklistItemSchema)
  })
  .strict();

export const prUsageSummarySchema = z
  .object({
    status: budgetUsageStatusSchema,
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    totalTokens: z.number().int().nonnegative().nullable(),
    source: nonEmptyStringSchema.nullable(),
    model: nonEmptyStringSchema.nullable(),
    recordedAt: isoDateTimeSchema.nullable(),
    note: z.string().nullable()
  })
  .strict();

export const prArtifactSchema = z
  .object({
    success: z.boolean(),
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    summary: nonEmptyStringSchema,
    requirementsCovered: z.array(prRequirementSchema),
    tasksIncluded: z.array(prTaskSchema),
    changedFiles: z.array(prChangedFileSchema),
    validationEvidence: prEvidenceSchema,
    reviewEvidence: prEvidenceSchema,
    reconcileEvidence: prEvidenceSchema,
    policyGate: policyGateSummarySchema.optional(),
    implementationChecklist: prImplementationChecklistSchema,
    usage: prUsageSummarySchema,
    risks: stringListSchema,
    rollback: stringListSchema,
    checklist: stringListSchema,
    followUps: stringListSchema,
    warnings: stringListSchema,
    errors: stringListSchema,
    generatedAt: isoDateTimeSchema
  })
  .strict();

export type PrArtifact = z.infer<typeof prArtifactSchema>;
export type PrStatus = z.infer<typeof prStatusSchema>;
