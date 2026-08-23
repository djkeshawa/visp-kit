import { z } from "zod";

import { isoDateTimeSchema, nonEmptyStringSchema } from "./common.schema.js";

/**
 * What intel store the last `visp-kit scan` actually read, if any.
 *
 * This is PROVENANCE, not a scan artifact. It lives in its own file, is not a
 * member of `artifactSchemas`, and is not re-exported from `schemas/index.ts`,
 * so it is reachable from Kit's public surface only as a path — deliberately,
 * because the scan artifact contract is the thing Phase 21 promised not to
 * change and this is the record of a fact scan learned, not a fact about the
 * project scan describes.
 *
 * It previously lived as an always-present top-level `intel` key on
 * `.visp/cache/scan-meta.json`. That file is the one scan artifact with no
 * schema anywhere in Kit, so "additive and therefore non-breaking" could not be
 * checked by Kit's own machinery, and P21-KIT-01's exit says the artifact
 * contract is UNCHANGED rather than compatibly extended. Moving the field out
 * makes the promise literally true again and gives the field the validation the
 * old home could not.
 *
 * `store` is `null` when the project has no readable intel store, and
 * `storeAbsenceReason` says which of the nine ways that happened. The file is
 * written on EVERY scan either way, so a scan that no longer finds a store
 * overwrites a previous instance id rather than leaving it behind: deleting
 * `.visp-intel/` and re-scanning must not leave a case from the deleted store
 * looking current.
 */
/**
 * Why scan recorded no intel store, as a CLOSED enumeration — one member per
 * way `loadIntelGraph` can return without a file graph, in the order it
 * evaluates them.
 *
 * Closed, and this list is the only copy. Free text would make the field
 * satisfiable by `""`, `"unknown"` or an empty join, which records nothing a
 * reader can count, group or act on; the point of the field is that a store's
 * absence is a fact with a cause, and eight of the nine causes already had a
 * warning while the ninth — `intel_absent`, the common case — had nothing at
 * all.
 *
 * A member is a fact about what scan found. **It authorizes nothing.** No
 * consumer may read a reason as a licence to proceed: `store: null` means no
 * intel store, and every gate that fails closed on that keeps failing closed on
 * it whatever the reason says.
 */
export const intelStoreAbsenceReasons = [
  /** The projection path could not be probed at all. */
  "projection_path_unreadable",
  /** No consumer projection and no archival export: the project has no intel. */
  "intel_absent",
  /** The archival export is on disk but the consumer projection is not. */
  "projection_missing_export_present",
  /** The projection is larger than Kit's read limit. */
  "projection_above_read_limit",
  /** The projection exists but could not be sized. */
  "projection_size_unreadable",
  /** The projection could not be read or parsed as JSON. */
  "projection_unreadable",
  /** The projection parsed but is not intel's consumer-projection shape. */
  "projection_shape_mismatch",
  /** The projection describes a snapshot that was not the repository head. */
  "projection_snapshot_not_head",
  /** The projection is valid and indexed no files. */
  "projection_indexed_no_files"
] as const;

export const intelStoreAbsenceReasonSchema = z.enum(intelStoreAbsenceReasons);

export type IntelStoreAbsenceReason = z.infer<typeof intelStoreAbsenceReasonSchema>;

const intelStoreSchema = z.object({
  repositoryInstanceId: nonEmptyStringSchema,
  headSnapshotId: nonEmptyStringSchema,
  indexedFileCount: z.number().int().nonnegative()
});

/**
 * The READ contract, and it is additive: `storeAbsenceReason` is optional here
 * precisely so a file written by a Kit that predates the field still parses.
 * The schema is `.strict()`, so the compatibility question runs both ways — a
 * new key is a hard parse failure for an old reader, and an absent key would be
 * one for a new reader that demanded it.
 */
export const intelScanProvenanceSchema = z
  .object({
    generatedAt: isoDateTimeSchema,
    store: intelStoreSchema.nullable(),
    storeAbsenceReason: intelStoreAbsenceReasonSchema.optional()
  })
  .strict();

/**
 * The WRITE contract: strictly narrower than the read contract, never wider.
 *
 * `store: null` with no reason is exactly the artifact this ticket exists to
 * stop being written, and `writeArtifact` validates before writing, so refusing
 * it here is what makes "a bare null with no reason cannot be written" true of
 * the product rather than of one call site. The converse is refused too: a
 * reason alongside a store that WAS read would be a record of something that
 * did not happen.
 *
 * Deliberately a second schema rather than a tightening of the first. Kit reads
 * files it did not write in this version, and a reader that rejected the
 * previous shape would turn an additive field into a breaking one.
 */
export const intelScanProvenanceWriteSchema = intelScanProvenanceSchema.superRefine(
  (value, context) => {
    if (value.store === null && value.storeAbsenceReason === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storeAbsenceReason"],
        message: `Required when \`store\` is null: one of ${intelStoreAbsenceReasons.join(", ")}.`
      });
    }

    if (value.store !== null && value.storeAbsenceReason !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storeAbsenceReason"],
        message: "Must be absent when `store` is present; a store that was read has no absence."
      });
    }
  }
);

export type IntelScanProvenance = z.infer<typeof intelScanProvenanceSchema>;
