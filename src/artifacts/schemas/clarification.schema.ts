import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema
} from "./common.schema.js";

export const clarificationQuestionCategorySchema = z.enum([
  "behavior",
  "data",
  "api",
  "security",
  "ui",
  "performance",
  "integration",
  "testing",
  "other"
]);

export const clarificationQuestionStatusSchema = z.enum([
  "unanswered",
  "answered",
  "accepted_default"
]);

export const clarificationSourceSchema = z.enum([
  "constitution",
  "intent",
  "scan",
  "default",
  "user"
]);

export const clarificationQuestionSchema = z
  .object({
    id: idSchema,
    question: nonEmptyStringSchema,
    category: clarificationQuestionCategorySchema,
    blocking: z.boolean(),
    recommendedDefault: nonEmptyStringSchema,
    reason: nonEmptyStringSchema,
    status: clarificationQuestionStatusSchema,
    answer: z.string()
  })
  .strict();

export const clarificationAssumptionSchema = z
  .object({
    id: idSchema,
    text: nonEmptyStringSchema,
    reason: nonEmptyStringSchema,
    source: clarificationSourceSchema,
    accepted: z.boolean()
  })
  .strict();

export const clarificationArtifactSchema = z
  .object({
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    status: z.enum(["draft", "ready"]),
    questions: z.array(clarificationQuestionSchema),
    assumptions: z.array(clarificationAssumptionSchema),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;
export type ClarificationAssumption = z.infer<typeof clarificationAssumptionSchema>;
export type ClarificationArtifact = z.infer<typeof clarificationArtifactSchema>;
