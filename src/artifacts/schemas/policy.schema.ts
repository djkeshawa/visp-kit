import { z } from "zod";

import { isoDateTimeSchema, nonEmptyStringSchema } from "./common.schema.js";

export const strictnessModeSchema = z.enum([
  "relaxed",
  "standard",
  "strict",
  "locked"
]);

export const policyRulesSchema = z
  .object({
    requireScanBeforeFeature: z.boolean(),
    requireConstitutionBeforeFeature: z.boolean(),
    requireClarifyBeforeSpec: z.boolean(),
    requireSpecBeforePlan: z.boolean(),
    requirePlanBeforeTasks: z.boolean(),
    requireTasksBeforeContext: z.boolean(),
    requireContextBeforeImplementation: z.boolean(),
    requireRequirementMappingForTasks: z.boolean(),
    requireAcceptanceCriteriaForBehaviorTasks: z.boolean(),
    requireValidationCommands: z.boolean(),
    blockForbiddenFileChanges: z.boolean(),
    blockOutOfScopeChanges: z.boolean(),
    blockUnapprovedDependencyChanges: z.boolean(),
    requireVerifyBeforeReview: z.boolean(),
    requireReviewBeforeReconcile: z.boolean(),
    requireReconcileBeforePr: z.boolean(),
    requireTraceabilityUpdateBeforePr: z.boolean(),
    requirePolicyValidation: z.boolean(),
    userPromptCannotOverridePolicy: z.boolean(),
    stopOnFailedGate: z.boolean()
  })
  .strict();

export const policyLimitsSchema = z
  .object({
    maxChangedFilesPerTask: z.number().int().min(1),
    maxOutOfScopeFiles: z.number().int().min(0),
    maxVerificationFailuresBeforeStop: z.number().int().min(0),
    maxReviewErrors: z.number().int().min(0),
    maxReconcileErrors: z.number().int().min(0),
    maxContextOverBudgetPercent: z.number().int().min(0).max(100)
  })
  .strict();

export const policyOverridesSchema = z
  .object({
    allowed: z.boolean(),
    requireReason: z.boolean(),
    recordInReports: z.boolean(),
    allowedInLockedMode: z.boolean(),
    nonOverridableRules: z.array(nonEmptyStringSchema.regex(/^VSP\d{3}$/))
  })
  .strict();

export const policyArtifactSchema = z
  .object({
    version: z.literal("1.0"),
    strictnessMode: strictnessModeSchema,
    rules: policyRulesSchema,
    limits: policyLimitsSchema,
    overrides: policyOverridesSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type StrictnessMode = z.infer<typeof strictnessModeSchema>;
export type PolicyRules = z.infer<typeof policyRulesSchema>;
export type PolicyLimits = z.infer<typeof policyLimitsSchema>;
export type PolicyOverrides = z.infer<typeof policyOverridesSchema>;
export type PolicyArtifact = z.infer<typeof policyArtifactSchema>;
