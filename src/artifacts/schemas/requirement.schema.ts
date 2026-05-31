import { z } from "zod";

import {
  idSchema,
  nonEmptyStringSchema,
  requirementPrioritySchema,
  requirementSourceSchema,
  validationMethodSchema
} from "./common.schema.js";

export const acceptanceCriterionSchema = z
  .object({
    id: idSchema,
    requirementId: idSchema,
    description: nonEmptyStringSchema,
    testable: z.boolean(),
    validationMethod: validationMethodSchema
  })
  .strict();

export const assumptionSchema = z
  .object({
    id: idSchema,
    description: nonEmptyStringSchema
  })
  .strict();

export const requirementSchema = z
  .object({
    id: idSchema,
    featureId: idSchema,
    title: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    source: requirementSourceSchema,
    priority: requirementPrioritySchema,
    acceptanceCriteria: z.array(acceptanceCriterionSchema),
    assumptions: z.array(assumptionSchema),
    outOfScope: z.array(nonEmptyStringSchema)
  })
  .strict();

export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>;
export type Assumption = z.infer<typeof assumptionSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
