import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  riskLevelSchema,
  stringListSchema
} from "./common.schema.js";

export const planDecisionSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema,
    decision: nonEmptyStringSchema,
    rationale: nonEmptyStringSchema,
    alternatives: stringListSchema,
    relatedRequirementIds: z.array(idSchema)
  })
  .strict();

export const planRiskSchema = z
  .object({
    id: idSchema,
    description: nonEmptyStringSchema,
    level: riskLevelSchema,
    mitigation: nonEmptyStringSchema
  })
  .strict();

export const planArtifactSchema = z
  .object({
    id: idSchema,
    featureId: idSchema,
    summary: nonEmptyStringSchema,
    decisions: z.array(planDecisionSchema),
    risks: z.array(planRiskSchema),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type PlanDecision = z.infer<typeof planDecisionSchema>;
export type PlanRisk = z.infer<typeof planRiskSchema>;
export type PlanArtifact = z.infer<typeof planArtifactSchema>;
