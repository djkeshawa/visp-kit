import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  stringListSchema
} from "./common.schema.js";

export const constitutionRuleCategorySchema = z.enum([
  "architecture",
  "testing",
  "security",
  "style",
  "workflow",
  "documentation",
  "other"
]);

export const constitutionRuleSeveritySchema = z.enum(["must", "should", "could"]);

export const constitutionRuleSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    category: constitutionRuleCategorySchema,
    severity: constitutionRuleSeveritySchema,
    appliesTo: stringListSchema
  })
  .strict();

export const constitutionArtifactSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema,
    rules: z.array(constitutionRuleSchema),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type ConstitutionRuleCategory = z.infer<typeof constitutionRuleCategorySchema>;
export type ConstitutionRuleSeverity = z.infer<typeof constitutionRuleSeveritySchema>;
export type ConstitutionRule = z.infer<typeof constitutionRuleSchema>;
export type ConstitutionArtifact = z.infer<typeof constitutionArtifactSchema>;
