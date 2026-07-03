import { z } from "zod";

import { idSchema, isoDateTimeSchema, nonEmptyStringSchema } from "./common.schema.js";
import { gateStageSchema } from "./gate.schema.js";

export const overrideScopeSchema = z.enum(["project", "feature", "task", "stage"]);

export const overrideStatusSchema = z.enum(["active", "revoked", "expired"]);

export const overrideRecordSchema = z
  .object({
    id: nonEmptyStringSchema.regex(/^OVR\d{3,}$/),
    ruleId: idSchema.regex(/^VSP\d{3}$/),
    scope: overrideScopeSchema,
    featureId: idSchema.nullable().optional(),
    featureSlug: nonEmptyStringSchema.nullable().optional(),
    taskId: idSchema.nullable().optional(),
    stage: gateStageSchema.nullable().optional(),
    reason: nonEmptyStringSchema.min(12),
    status: overrideStatusSchema,
    createdAt: isoDateTimeSchema,
    createdBy: nonEmptyStringSchema,
    expiresAt: isoDateTimeSchema.nullable().optional(),
    revokedAt: isoDateTimeSchema.nullable().optional(),
    revokedReason: nonEmptyStringSchema.nullable().optional()
  })
  .strict();

export const overrideArtifactSchema = z
  .object({
    version: z.literal("1.0"),
    overrides: z.array(overrideRecordSchema)
  })
  .strict();

export type OverrideScope = z.infer<typeof overrideScopeSchema>;
export type OverrideStatus = z.infer<typeof overrideStatusSchema>;
export type OverrideRecord = z.infer<typeof overrideRecordSchema>;
export type OverrideArtifact = z.infer<typeof overrideArtifactSchema>;
