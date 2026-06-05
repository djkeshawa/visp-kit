import { z } from "zod";

import {
  commandStringSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  presetSchema,
  stringListSchema
} from "./common.schema.js";

export const presetPackSchema = z
  .object({
    name: presetSchema,
    description: nonEmptyStringSchema,
    validationCommandHints: z.array(commandStringSchema),
    dependencyFiles: z.array(pathStringSchema),
    testFilePatterns: z.array(nonEmptyStringSchema),
    contextIncludePatterns: z.array(pathStringSchema),
    securityChecklist: stringListSchema,
    reviewFocus: stringListSchema,
    recommendedGates: stringListSchema
  })
  .strict();

export type PresetPack = z.infer<typeof presetPackSchema>;
