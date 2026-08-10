import { z } from "zod";

import { nonEmptyStringSchema } from "./common.schema.js";

/**
 * The Understanding Case export (ADR 0014 Q1).
 *
 * Written ONLY by `visp-intel understanding export --task <id>` and read here.
 * Kit never writes this file. Everything in it is descriptive evidence: it
 * authorizes nothing, and `authority`/`authorizationEffect` are checked by the
 * reader before any other field is used.
 *
 * Two deliberate looseness decisions:
 *
 * - `kind` values (entity kinds) are a 27-value enum owned by intel. Copying
 *   that enum here would mean a new intel entity kind silently invalidates
 *   every export Kit reads, for a field Kit only prints. It stays a string.
 * - `case` is intel's verbatim object and intel may extend it. A plain (not
 *   `.strict()`) object strips unknown keys instead of rejecting the file, so
 *   an additive intel change degrades to "Kit ignored a field" rather than
 *   "Kit lost the case". The top level IS strict: ADR 0014 fixes it at seven
 *   keys, and an eighth means the contract moved.
 */

const materialIdSchema = nonEmptyStringSchema;

export const understandingHypothesisSchema = z.object({
  id: nonEmptyStringSchema,
  statement: z.string(),
  status: z.enum(["supported", "refuted", "unresolved"]),
  evidenceIds: z.array(materialIdSchema)
});

export const understandingObservationSchema = z.object({
  statement: z.string(),
  evidenceIds: z.array(materialIdSchema)
});

export const understandingValidationSuggestionSchema = z.object({
  description: z.string(),
  entityIds: z.array(materialIdSchema),
  evidenceIds: z.array(materialIdSchema)
});

export const understandingCaseSchema = z.object({
  schemaVersion: nonEmptyStringSchema,
  authority: nonEmptyStringSchema,
  authorizationEffect: nonEmptyStringSchema,
  id: materialIdSchema,
  taskStateId: materialIdSchema,
  taskId: nonEmptyStringSchema,
  snapshotId: materialIdSchema,
  behavioralQuestion: z.string(),
  observations: z.array(understandingObservationSchema),
  hypotheses: z.array(understandingHypothesisSchema),
  entrypointIds: z.array(materialIdSchema),
  relationIds: z.array(materialIdSchema),
  evidenceIds: z.array(materialIdSchema),
  unknownIds: z.array(materialIdSchema),
  candidateChangeEntityIds: z.array(materialIdSchema),
  affectedUnchangedEntityIds: z.array(materialIdSchema),
  affectedTestIds: z.array(materialIdSchema),
  queryReceiptIds: z.array(materialIdSchema),
  impactQueryReceiptIds: z.array(materialIdSchema),
  validationSuggestions: z.array(understandingValidationSuggestionSchema)
});

/**
 * `startLine`/`endLine` are ZERO-BASED (intel's `SourceSpan`). Nothing that
 * renders a line number to a human may use them directly; see
 * `understanding-view.ts`, which adds 1 at the single render boundary.
 *
 * `displayName` is display only. Joining on it is the Phase 19 false-edge
 * defect: two entities named `handler` in two files are two identities, and
 * the identity is the map key.
 */
export const understandingResolutionEntrySchema = z
  .object({
    kind: nonEmptyStringSchema,
    filePath: z.string().nullable(),
    startLine: z.number().int().nonnegative().nullable(),
    endLine: z.number().int().nonnegative().nullable(),
    signature: z.string(),
    displayName: z.string()
  })
  .strict();

export const understandingIdentitySchema = z
  .object({
    repositoryInstanceId: materialIdSchema,
    snapshotId: materialIdSchema,
    headSnapshotId: materialIdSchema,
    // null means the repository was indexed WITHOUT git identity. It does not
    // mean "no commit", and Kit's currentness rule correctly fails on it.
    gitCommit: z.string().nullable(),
    dirty: z.boolean().nullable(),
    worktreeFingerprint: nonEmptyStringSchema
  })
  .strict();

export const understandingPathRowSchema = z
  .object({
    relationId: materialIdSchema,
    sourceId: materialIdSchema,
    targetId: materialIdSchema,
    kind: nonEmptyStringSchema,
    evidenceId: materialIdSchema
  })
  .strict();

export const understandingCountsSchema = z
  .object({
    entrypoints: z.number().int().nonnegative(),
    pathRelations: z.number().int().nonnegative(),
    candidateChanges: z.number().int().nonnegative(),
    affectedUnchanged: z.number().int().nonnegative(),
    affectedTests: z.number().int().nonnegative(),
    unknowns: z.number().int().nonnegative()
  })
  .strict();

export const understandingCaseExportSchema = z
  .object({
    kind: z.literal("understanding-case-export"),
    schemaVersion: z.literal("1.0"),
    case: understandingCaseSchema,
    resolution: z.record(materialIdSchema, understandingResolutionEntrySchema),
    identity: understandingIdentitySchema,
    path: z.array(understandingPathRowSchema),
    counts: understandingCountsSchema
  })
  .strict();

export type UnderstandingCase = z.infer<typeof understandingCaseSchema>;
export type UnderstandingResolutionEntry = z.infer<typeof understandingResolutionEntrySchema>;
export type UnderstandingIdentity = z.infer<typeof understandingIdentitySchema>;
export type UnderstandingPathRow = z.infer<typeof understandingPathRowSchema>;
export type UnderstandingCounts = z.infer<typeof understandingCountsSchema>;
export type UnderstandingCaseExport = z.infer<typeof understandingCaseExportSchema>;
