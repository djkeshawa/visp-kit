import { z } from "zod";

import { nonEmptyStringSchema } from "./common.schema.js";

/**
 * The subset of intel's CONSUMER PROJECTION that Kit's scan reads.
 *
 * Produced by `visp-intel repo projection`, which writes
 * `.visp-intel/projection/graph.json` by default. This is not the archival
 * `repo export`: the export carries every snapshot on the lineage, every
 * evidence record and a ~90-byte URN in every reference slot, and measured
 * 128.1 MiB on this repository — twice the read limit Kit's scanner applied, so
 * scan degraded to its own analysis and the graph never reached the artifact.
 * The projection is one snapshot, integer-coded against dictionaries, and 1.89
 * MiB on the same repository.
 *
 * Nothing here is `.strict()`. Intel may add columns, dictionaries and
 * top-level keys, and an additive change on intel's side must not turn a usable
 * projection into a missing one. Kit declares only what it consumes.
 *
 * Kit never writes this file, never imports an intel package and never shells
 * out to the intel CLI. Sequencing the projection is Hyper's job.
 */
const projectionCellSchema = z.union([z.number(), z.string(), z.null()]);

/**
 * `{ columns, rows }`, where `columns` names each position. Intel's contract is
 * that a reader never hard-codes an offset, so Kit resolves every column by
 * name and this schema refuses a table that does not carry the columns Kit
 * reads — a refusal is a warning and Kit's own analysis, never a failed scan.
 */
function projectionTableSchema(required: readonly string[]) {
  return z
    .object({
      columns: z.array(nonEmptyStringSchema),
      rows: z.array(z.array(projectionCellSchema))
    })
    .superRefine((table, ctx) => {
      for (const column of required) {
        if (!table.columns.includes(column)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `table is missing the "${column}" column`
          });
        }
      }

      const width = table.columns.length;
      const ragged = table.rows.findIndex((row) => row.length !== width);

      if (ragged !== -1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `row ${ragged} has ${table.rows[ragged]?.length ?? 0} cells against ${width} columns`
        });
      }
    });
}

export const intelProjectionNodesSchema = projectionTableSchema(["path", "kind", "name"]);
export const intelProjectionEdgesSchema = projectionTableSchema(["source", "target", "kind"]);

export const intelProjectionSchema = z.object({
  // A literal, so pointing this path at an archival export is a shape warning
  // naming the artifact rather than a silently empty file graph.
  kind: z.literal("consumer-graph-projection"),
  schemaVersion: nonEmptyStringSchema,
  identity: z.object({
    repositoryInstanceId: nonEmptyStringSchema,
    // What the rows are material in, and the head at projection time. Intel
    // states both and carries no `stale` flag: judging currency is Kit's call.
    snapshotId: nonEmptyStringSchema,
    headSnapshotId: nonEmptyStringSchema
  }),
  dictionaries: z.object({
    nodeKinds: z.array(z.string()),
    edgeKinds: z.array(z.string()),
    paths: z.array(z.string())
  }),
  nodes: intelProjectionNodesSchema,
  edges: intelProjectionEdgesSchema
});

export type IntelProjection = z.infer<typeof intelProjectionSchema>;
