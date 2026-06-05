import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";

export const timelineEventSchema = z
  .object({
    id: idSchema,
    kind: z.enum([
      "artifact",
      "context",
      "verification",
      "review",
      "reconcile",
      "pr",
      "budget",
      "override",
      "run"
    ]),
    title: nonEmptyStringSchema,
    status: nonEmptyStringSchema,
    path: pathStringSchema.optional(),
    taskId: idSchema.optional(),
    createdAt: isoDateTimeSchema.optional()
  })
  .strict();

export const featureTimelineSchema = z
  .object({
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    generatedAt: isoDateTimeSchema,
    taskCount: z.number().int().nonnegative(),
    completedTaskCount: z.number().int().nonnegative(),
    estimatedTokens: z.number().int().nonnegative().optional(),
    actualTokens: z.number().int().nonnegative().optional(),
    openBlockers: stringListSchema,
    events: z.array(timelineEventSchema)
  })
  .strict();

export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type FeatureTimeline = z.infer<typeof featureTimelineSchema>;
