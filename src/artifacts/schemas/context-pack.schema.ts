import { z } from "zod";

import {
  budgetModeSchema,
  commandStringSchema,
  idSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";

export const contextIncludeModeSchema = z.enum(["summary", "snippet", "full"]);

export const contextFileSchema = z
  .object({
    path: pathStringSchema,
    reason: nonEmptyStringSchema,
    includeMode: contextIncludeModeSchema,
    hash: nonEmptyStringSchema
  })
  .strict();

export const contextSnippetSchema = z
  .object({
    path: pathStringSchema,
    reason: nonEmptyStringSchema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    hash: nonEmptyStringSchema,
    content: nonEmptyStringSchema
  })
  .strict()
  .refine((snippet) => snippet.endLine >= snippet.startLine, {
    message: "endLine must be greater than or equal to startLine.",
    path: ["endLine"]
  });

export const contextPackSchema = z
  .object({
    id: idSchema,
    featureId: idSchema,
    taskId: idSchema,
    budgetMode: budgetModeSchema,
    estimatedTokens: z.number().int().nonnegative(),
    includedRequirements: z.array(idSchema),
    includedAcceptanceCriteria: z.array(idSchema),
    includedConstitutionRules: z.array(idSchema),
    includedFiles: z.array(contextFileSchema),
    includedSnippets: z.array(contextSnippetSchema),
    validationCommands: z.array(commandStringSchema),
    constraints: stringListSchema,
    instructions: stringListSchema
  })
  .strict();

export type ContextIncludeMode = z.infer<typeof contextIncludeModeSchema>;
export type ContextFile = z.infer<typeof contextFileSchema>;
export type ContextSnippet = z.infer<typeof contextSnippetSchema>;
export type ContextPack = z.infer<typeof contextPackSchema>;
