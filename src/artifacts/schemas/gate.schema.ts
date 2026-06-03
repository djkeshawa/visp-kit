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
    nextAllowedCommand: nonEmptyStringSchema,
    reportPath: pathStringSchema,
    evaluatedAt: isoDateTimeSchema
  })
  .strict();

export type GateStage = z.infer<typeof gateStageSchema>;
export type GateSeverity = z.infer<typeof gateSeveritySchema>;
export type GateRuleFinding = z.infer<typeof gateRuleFindingSchema>;
export type GateBlockedCommand = z.infer<typeof gateBlockedCommandSchema>;
export type GateResult = z.infer<typeof gateResultSchema>;
