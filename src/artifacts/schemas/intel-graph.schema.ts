import { z } from "zod";

import { nonEmptyStringSchema } from "./common.schema.js";

/**
 * The subset of intel's `RepositoryExport` that Kit's scan reads.
 *
 * Produced by `visp-intel repo export --output .visp-intel/graph.json`. The
 * FORMAT is intel's and intel may extend it, so nothing here is `.strict()` —
 * unknown keys are stripped, not rejected, and an additive intel change cannot
 * turn a usable graph into a missing one. Kit declares only the fields it
 * actually reads; declaring more would be Kit asserting a contract it does not
 * consume.
 *
 * Kit never writes this file, never imports an intel package, and never shells
 * out to the intel CLI. Sequencing the export is Hyper's job.
 */
export const intelGraphEntitySchema = z.object({
  id: nonEmptyStringSchema,
  snapshotId: nonEmptyStringSchema,
  kind: nonEmptyStringSchema,
  canonicalName: z.string(),
  path: z.string().optional(),
  symbol: z.string().optional()
});

export const intelGraphRelationSchema = z.object({
  id: nonEmptyStringSchema,
  sourceId: nonEmptyStringSchema,
  targetId: nonEmptyStringSchema,
  kind: nonEmptyStringSchema
});

export const intelGraphSchema = z.object({
  schemaVersion: nonEmptyStringSchema,
  repositoryInstanceId: nonEmptyStringSchema,
  headSnapshotId: nonEmptyStringSchema,
  entities: z.array(intelGraphEntitySchema),
  relations: z.array(intelGraphRelationSchema)
});

export type IntelGraphEntity = z.infer<typeof intelGraphEntitySchema>;
export type IntelGraphRelation = z.infer<typeof intelGraphRelationSchema>;
export type IntelGraph = z.infer<typeof intelGraphSchema>;
