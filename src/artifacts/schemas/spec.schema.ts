import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema
} from "./common.schema.js";
import {
  acceptanceCriterionSchema,
  assumptionSchema,
  requirementSchema
} from "./requirement.schema.js";

export const userStorySchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema,
    actor: nonEmptyStringSchema,
    capability: nonEmptyStringSchema,
    outcome: nonEmptyStringSchema
  })
  .strict();

export const nonFunctionalRequirementsSchema = z
  .object({
    performance: z.array(nonEmptyStringSchema),
    security: z.array(nonEmptyStringSchema),
    accessibility: z.array(nonEmptyStringSchema),
    reliability: z.array(nonEmptyStringSchema),
    maintainability: z.array(nonEmptyStringSchema)
  })
  .strict();

export const specArtifactSchema = z
  .object({
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    status: z.enum(["draft", "ready"]),
    userStories: z.array(userStorySchema),
    requirements: z.array(requirementSchema),
    acceptanceCriteria: z.array(acceptanceCriterionSchema),
    businessRules: z.array(nonEmptyStringSchema),
    nonFunctionalRequirements: nonFunctionalRequirementsSchema,
    edgeCases: z.array(nonEmptyStringSchema),
    assumptions: z.array(assumptionSchema),
    outOfScope: z.array(nonEmptyStringSchema),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type UserStory = z.infer<typeof userStorySchema>;
export type NonFunctionalRequirements = z.infer<typeof nonFunctionalRequirementsSchema>;
export type SpecArtifact = z.infer<typeof specArtifactSchema>;
