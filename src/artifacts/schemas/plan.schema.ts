import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  commandStringSchema,
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

export const planEvidenceSchema = z
  .object({
    knownFromUser: stringListSchema,
    knownFromSpecification: stringListSchema,
    knownFromCodebase: stringListSchema,
    knownFromConstitution: stringListSchema,
    inferred: stringListSchema,
    assumed: stringListSchema,
    unknown: stringListSchema
  })
  .strict();

export const affectedModuleSchema = z
  .object({
    moduleOrFileArea: nonEmptyStringSchema,
    reason: nonEmptyStringSchema,
    evidence: nonEmptyStringSchema
  })
  .strict();

export const planImpactsSchema = z
  .object({
    dataModel: nonEmptyStringSchema,
    api: nonEmptyStringSchema,
    ui: nonEmptyStringSchema,
    securityPrivacy: nonEmptyStringSchema,
    performance: nonEmptyStringSchema
  })
  .strict();

export const testingStrategyItemSchema = z
  .object({
    level: nonEmptyStringSchema,
    whatToTest: nonEmptyStringSchema,
    validationCommand: commandStringSchema
  })
  .strict();

export const planAlternativeSchema = z
  .object({
    option: nonEmptyStringSchema,
    decision: nonEmptyStringSchema,
    reason: nonEmptyStringSchema
  })
  .strict();

export const planDependenciesSchema = z
  .object({
    newDependenciesRequired: z.boolean(),
    notes: nonEmptyStringSchema,
    requiresApproval: z.boolean()
  })
  .strict();

export const planDraftDecisionSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema,
    decision: nonEmptyStringSchema,
    reason: nonEmptyStringSchema,
    evidence: nonEmptyStringSchema,
    impacts: nonEmptyStringSchema,
    requirementIds: z.array(idSchema)
  })
  .strict();

export const planDraftRiskSchema = z
  .object({
    id: idSchema,
    description: nonEmptyStringSchema,
    level: riskLevelSchema,
    mitigation: nonEmptyStringSchema,
    requirementIds: z.array(idSchema)
  })
  .strict();

export const planDraftArtifactSchema = z
  .object({
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    status: z.enum(["draft_invalid", "draft", "ready"]),
    evidence: planEvidenceSchema,
    affectedModules: z.array(affectedModuleSchema),
    implementationApproach: nonEmptyStringSchema,
    impacts: planImpactsSchema,
    testingStrategy: z.array(testingStrategyItemSchema),
    rollbackStrategy: nonEmptyStringSchema,
    alternatives: z.array(planAlternativeSchema),
    dependencies: planDependenciesSchema,
    risks: z.array(planDraftRiskSchema),
    decisions: z.array(planDraftDecisionSchema),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type PlanDecision = z.infer<typeof planDecisionSchema>;
export type PlanRisk = z.infer<typeof planRiskSchema>;
export type PlanArtifact = z.infer<typeof planArtifactSchema>;
export type PlanDraftArtifact = z.infer<typeof planDraftArtifactSchema>;
