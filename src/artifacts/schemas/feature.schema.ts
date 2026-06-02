import { z } from "zod";

import {
  budgetModeSchema,
  featureStatusSchema,
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  riskLevelSchema
} from "./common.schema.js";

export const featureSchema = z
  .object({
    id: idSchema,
    slug: nonEmptyStringSchema.regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use a lowercase kebab-case slug."
    ),
    title: nonEmptyStringSchema,
    status: featureStatusSchema,
    budgetMode: budgetModeSchema,
    riskLevel: riskLevelSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const featureIntentSchema = featureSchema
  .extend({
    rawUserRequest: nonEmptyStringSchema
  })
  .strict();

export type Feature = z.infer<typeof featureSchema>;
export type FeatureIntent = z.infer<typeof featureIntentSchema>;
