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

export const budgetArtifactSchema = z
  .object({
    policies: z.array(budgetPolicySchema),
    reports: z.array(budgetReportSchema)
  })
  .strict();

export type ClarificationLevel = z.infer<typeof clarificationLevelSchema>;
export type ReviewLevel = z.infer<typeof reviewLevelSchema>;
export type SecurityReviewPolicy = z.infer<typeof securityReviewPolicySchema>;
export type BudgetPolicy = z.infer<typeof budgetPolicySchema>;
export type BudgetReport = z.infer<typeof budgetReportSchema>;
export type BudgetArtifact = z.infer<typeof budgetArtifactSchema>;
