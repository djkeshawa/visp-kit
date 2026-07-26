import { z } from "zod";

import { isoDateTimeSchema, nonEmptyStringSchema } from "./common.schema.js";
import { assuranceProfileSchema } from "./evidence.schema.js";

export const strictnessModeSchema = z.enum(["relaxed", "standard", "strict", "locked"]);

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
    stopOnFailedGate: z.boolean(),
    // Optional so policy files written before this rule existed keep
    // validating; gates fall back to the strictness default when absent.
    blockOnUnresolvedDrift: z.boolean().optional(),
    preventAssuranceProfileLowering: z.boolean().optional(),
    requireOracleLockBeforeImplementation: z.boolean().optional(),
    requireCurrentAssuranceDecisionBeforePr: z.boolean().optional()
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
    assurance: z
      .object({
        profile: assuranceProfileSchema
      })
      .strict()
      .optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict()
  .superRefine((policy, ctx) => {
    // The non-overridable core (VSP019/VSP020) must never be disabled or
    // exposed as overridable, regardless of strictness mode. These guards live
    // at the schema level so every load path (policy-loader, policy-validator)
    // rejects a tampered policy artifact.
    if (policy.rules.userPromptCannotOverridePolicy !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rules", "userPromptCannotOverridePolicy"],
        message:
          "rules.userPromptCannotOverridePolicy must be true; VSP019 (user prompts cannot override policy) is non-overridable."
      });
    }

    if (policy.rules.stopOnFailedGate !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rules", "stopOnFailedGate"],
        message:
          "rules.stopOnFailedGate must be true; VSP020 (agents must stop on failed gates) is non-overridable."
      });
    }

    if (policy.rules.preventAssuranceProfileLowering === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rules", "preventAssuranceProfileLowering"],
        message:
          "rules.preventAssuranceProfileLowering cannot be false; use an auditable VSP022 override to lower assurance."
      });
    }

    // `strict` and `locked` are claims about enforcement level. Their defaults
    // enable both assurance rules, so an explicit `false` here is a policy that
    // calls itself strict while disabling the checks that make it strict. Drop
    // to `standard` instead. `undefined` stays valid so policy files written
    // before these rules existed keep validating.
    if (policy.strictnessMode === "strict" || policy.strictnessMode === "locked") {
      if (policy.rules.requireCurrentAssuranceDecisionBeforePr === false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules", "requireCurrentAssuranceDecisionBeforePr"],
          message:
            "rules.requireCurrentAssuranceDecisionBeforePr cannot be false in strict or locked mode; VSP024 is non-overridable. Use standard mode if PR readiness should not require a current assurance decision."
        });
      }

      if (policy.rules.blockOnUnresolvedDrift === false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules", "blockOnUnresolvedDrift"],
          message:
            "rules.blockOnUnresolvedDrift cannot be false in strict or locked mode; VSP021 keeps context packs grounded on current artifacts. Use standard mode if unresolved drift should not block."
        });
      }
    }

    for (const ruleId of ["VSP019", "VSP020"]) {
      if (!policy.overrides.nonOverridableRules.includes(ruleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["overrides", "nonOverridableRules"],
          message: `overrides.nonOverridableRules must include ${ruleId}; the non-overridable core cannot be removed.`
        });
      }
    }
  });

export type StrictnessMode = z.infer<typeof strictnessModeSchema>;
export type PolicyRules = z.infer<typeof policyRulesSchema>;
export type PolicyLimits = z.infer<typeof policyLimitsSchema>;
export type PolicyOverrides = z.infer<typeof policyOverridesSchema>;
export type PolicyArtifact = z.infer<typeof policyArtifactSchema>;
