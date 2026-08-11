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
 * `store` is `null` when the project has no readable intel store. The file is
 * written on EVERY scan either way, so a scan that no longer finds a store
 * overwrites a previous instance id rather than leaving it behind: deleting
 * `.visp-intel/` and re-scanning must not leave a case from the deleted store
 * looking current.
 */
export const intelScanProvenanceSchema = z
  .object({
    generatedAt: isoDateTimeSchema,
    store: z
      .object({
        repositoryInstanceId: nonEmptyStringSchema,
        headSnapshotId: nonEmptyStringSchema,
        indexedFileCount: z.number().int().nonnegative()
      })
      .nullable()
  })
  .strict();

export type IntelScanProvenance = z.infer<typeof intelScanProvenanceSchema>;
