import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";
import { strictnessModeSchema } from "./policy.schema.js";

export const gateStageSchema = z.enum([
  "next",
  "setup",
  "feature",
  "clarify",
  "spec",
  "plan",
  "tasks",
  "context",
  "implement",
  "verify",
  "review",
  "reconcile",
  "pr"
]);

export const gateSeveritySchema = z.enum(["info", "warning", "error"]);

export const gateFeatureSchema = z
  .object({
    id: idSchema,
    slug: nonEmptyStringSchema
  })
  .strict();

export const gateRuleFindingSchema = z
  .object({
    ruleId: idSchema,
    severity: gateSeveritySchema,
    message: nonEmptyStringSchema,
    recommendation: nonEmptyStringSchema,
    evidence: nonEmptyStringSchema
  })
  .strict();

export const gateBlockedCommandSchema = z
  .object({
    command: nonEmptyStringSchema,
    reason: nonEmptyStringSchema,
    ruleId: idSchema
  })
  .strict();

export const appliedPolicyOverrideSchema = z
  .object({
    overrideId: idSchema,
    ruleId: idSchema,
    scope: z.enum(["project", "feature", "task", "stage"]),
    reason: nonEmptyStringSchema,
    expiresAt: isoDateTimeSchema.nullable(),
    appliedToStage: gateStageSchema,
    appliedToFeatureId: idSchema.nullable(),
    appliedToTaskId: idSchema.nullable()
  })
  .strict();

export const gateResultSchema = z
  .object({
    success: z.boolean(),
    targetPath: pathStringSchema,
    stage: gateStageSchema,
    strictnessMode: strictnessModeSchema,
    allowed: z.boolean(),
    dryRun: z.boolean(),
    feature: gateFeatureSchema.nullable(),
    taskId: idSchema.nullable(),
    passedRules: z.array(idSchema),
    failedRules: z.array(gateRuleFindingSchema),
    warnings: stringListSchema,
    blockedCommands: z.array(gateBlockedCommandSchema),
    overriddenRules: z.array(idSchema),
    appliedOverrides: z.array(appliedPolicyOverrideSchema),
    nextAllowedCommand: nonEmptyStringSchema,
    // Bare, machine-runnable form of nextAllowedCommand. Optional so artifacts
    // written before this field existed keep parsing.
    nextCommand: nonEmptyStringSchema.optional(),
    reportPath: pathStringSchema,
    evaluatedAt: isoDateTimeSchema
  })
  .strict();

export const policyStatusSchema = z.enum(["valid", "missing", "invalid", "default"]);

export const policyGateSummarySchema = z
  .object({
    strictnessMode: strictnessModeSchema,
    policyStatus: policyStatusSchema,
    stage: gateStageSchema,
    allowed: z.boolean(),
    failedRules: z.array(gateRuleFindingSchema),
    blockedCommands: z.array(gateBlockedCommandSchema),
    overriddenRules: z.array(idSchema),
    appliedOverrides: z.array(appliedPolicyOverrideSchema),
    warnings: stringListSchema,
    nextAllowedCommand: nonEmptyStringSchema,
    // Bare, machine-runnable form of nextAllowedCommand. Optional so summaries
    // written before this field existed keep parsing.
    nextCommand: nonEmptyStringSchema.optional(),
    evaluatedAt: isoDateTimeSchema
  })
  .strict();

export type GateStage = z.infer<typeof gateStageSchema>;
export type GateSeverity = z.infer<typeof gateSeveritySchema>;
export type GateRuleFinding = z.infer<typeof gateRuleFindingSchema>;
export type GateBlockedCommand = z.infer<typeof gateBlockedCommandSchema>;
export type AppliedPolicyOverride = z.infer<typeof appliedPolicyOverrideSchema>;
export type GateResult = z.infer<typeof gateResultSchema>;
export type PolicyStatus = z.infer<typeof policyStatusSchema>;
export type PolicyGateSummary = z.infer<typeof policyGateSummarySchema>;
