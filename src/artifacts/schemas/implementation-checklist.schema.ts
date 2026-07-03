import { z } from "zod";

import { idSchema, isoDateTimeSchema, nonEmptyStringSchema } from "./common.schema.js";

export const implementationChecklistStatusSchema = z.enum([
  "pending",
  "done",
  "not_applicable",
  "unavailable",
  "blocked"
]);

export const implementationChecklistItemSchema = z
  .object({
    id: idSchema,
    label: nonEmptyStringSchema,
    status: implementationChecklistStatusSchema,
    required: z.boolean(),
    evidence: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const implementationChecklistArtifactSchema = z
  .object({
    version: z.literal("1.0"),
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema,
    generatedAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    items: z.array(implementationChecklistItemSchema)
  })
  .strict();

export type ImplementationChecklistStatus = z.infer<typeof implementationChecklistStatusSchema>;
export type ImplementationChecklistItem = z.infer<typeof implementationChecklistItemSchema>;
export type ImplementationChecklistArtifact = z.infer<typeof implementationChecklistArtifactSchema>;
