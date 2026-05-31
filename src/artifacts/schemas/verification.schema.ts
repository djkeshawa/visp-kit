import { z } from "zod";

import {
  commandStringSchema,
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  stringListSchema,
  verificationStatusSchema
} from "./common.schema.js";

export const validationCommandResultSchema = z
  .object({
    command: commandStringSchema,
    status: verificationStatusSchema,
    exitCode: z.number().int().nullable(),
    stdout: z.string(),
    stderr: z.string(),
    durationMs: z.number().int().nonnegative()
  })
  .strict();

export const verificationReportSchema = z
  .object({
    id: idSchema,
    featureId: idSchema,
    taskIds: z.array(idSchema),
    status: verificationStatusSchema,
    summary: nonEmptyStringSchema,
    commandResults: z.array(validationCommandResultSchema),
    verifiedRequirements: z.array(idSchema),
    verifiedAcceptanceCriteria: z.array(idSchema),
    notes: stringListSchema,
    createdAt: isoDateTimeSchema
  })
  .strict();

export type ValidationCommandResult = z.infer<
  typeof validationCommandResultSchema
>;
export type VerificationReport = z.infer<typeof verificationReportSchema>;
