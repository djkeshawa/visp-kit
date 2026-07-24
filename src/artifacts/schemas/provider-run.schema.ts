import { z } from "zod";

import { idSchema, nonEmptyStringSchema } from "./common.schema.js";
import { evidenceProviderIdentitySchema, evidenceResultSchema } from "./evidence.schema.js";

export const providerFailureCodeSchema = z.enum([
  "unsupported_provider",
  "malformed_output",
  "timeout",
  "command_not_found",
  "skipped_evidence"
]);

export const evidenceProviderRunSchema = z
  .object({
    version: z.literal("1.0"),
    id: idSchema,
    provider: evidenceProviderIdentitySchema,
    phase: z.enum(["baseline", "candidate"]),
    status: z.enum(["passed", "inconclusive"]),
    failure: z
      .object({
        code: providerFailureCodeSchema,
        reason: nonEmptyStringSchema
      })
      .strict()
      .nullable(),
    results: z.array(evidenceResultSchema)
  })
  .strict()
  .superRefine((run, context) => {
    if (run.status === "passed" && (run.failure !== null || run.results.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Passed provider runs require results and cannot contain a failure."
      });
    }
    if (run.status === "inconclusive" && run.failure === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failure"],
        message: "Inconclusive provider runs require a structured failure."
      });
    }
  });

export type ProviderFailureCode = z.infer<typeof providerFailureCodeSchema>;
export type EvidenceProviderRun = z.infer<typeof evidenceProviderRunSchema>;
