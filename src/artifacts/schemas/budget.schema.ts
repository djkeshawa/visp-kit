import { z } from "zod";

import {
  budgetModeSchema,
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  stringListSchema
} from "./common.schema.js";

export const clarificationLevelSchema = z.enum(["blocking", "important", "full"]);
export const reviewLevelSchema = z.enum(["diff", "context", "traceability"]);
export const securityReviewPolicySchema = z.enum([
  "medium-high-only",
  "risk-based",
  "always"
]);
export const budgetUsageStatusSchema = z.enum([
  "recorded",
  "unavailable",
  "not_recorded",
  "estimated_only"
]);

export const budgetPolicySchema = z
  .object({
    mode: budgetModeSchema,
    maxEstimatedTokens: z.number().int().positive(),
    maxFullFiles: z.number().int().nonnegative(),
    maxIncludedFiles: z.number().int().positive(),
    clarificationLevel: clarificationLevelSchema,
    reviewLevel: reviewLevelSchema,
    securityReview: securityReviewPolicySchema
  })
  .strict();

export const budgetReportSchema = z
  .object({
    id: idSchema,
    featureId: idSchema.optional(),
    mode: budgetModeSchema,
    estimatedTokens: z.number().int().nonnegative(),
    maxEstimatedTokens: z.number().int().positive(),
    withinBudget: z.boolean(),
    notes: stringListSchema,
    generatedAt: isoDateTimeSchema
  })
  .strict();

export const budgetUsageSchema = z
  .object({
    id: idSchema,
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema,
    status: budgetUsageStatusSchema.default("recorded"),
    inputTokens: z.number().int().nonnegative().nullable().optional(),
    outputTokens: z.number().int().nonnegative().nullable().optional(),
    totalTokens: z.number().int().nonnegative().nullable().optional(),
    model: nonEmptyStringSchema.optional(),
    source: z.enum(["agent", "agent-reported", "manual"]),
    note: z.string().optional(),
    recordedAt: isoDateTimeSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status !== "recorded") return;

    if (
      value.inputTokens === undefined ||
      value.inputTokens === null ||
      value.outputTokens === undefined ||
      value.outputTokens === null ||
      value.totalTokens === undefined ||
      value.totalTokens === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recorded usage requires inputTokens, outputTokens, and totalTokens."
      });
    }
  });

export const budgetArtifactSchema = z
  .object({
    policies: z.array(budgetPolicySchema),
    reports: z.array(budgetReportSchema),
    usage: z.array(budgetUsageSchema)
  })
  .strict();

export type ClarificationLevel = z.infer<typeof clarificationLevelSchema>;
export type ReviewLevel = z.infer<typeof reviewLevelSchema>;
export type SecurityReviewPolicy = z.infer<typeof securityReviewPolicySchema>;
export type BudgetUsageStatus = z.infer<typeof budgetUsageStatusSchema>;
export type BudgetPolicy = z.infer<typeof budgetPolicySchema>;
export type BudgetReport = z.infer<typeof budgetReportSchema>;
export type BudgetUsage = z.infer<typeof budgetUsageSchema>;
export type BudgetArtifact = z.infer<typeof budgetArtifactSchema>;
