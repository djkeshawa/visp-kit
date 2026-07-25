import { createHash } from "node:crypto";

import { type AssuranceCaseWithoutHash } from "../artifacts/schemas/assurance-case.schema.js";
import { canonicalJsonV1, type Sha256Hash } from "../integration/canonical-json.js";

export const assuranceCaseHashDomain = "visp.assurance-case\0canonical-1.0\0";

export function createAssuranceCaseHash(
  assuranceCaseWithoutHash: AssuranceCaseWithoutHash
): Sha256Hash {
  const digest = createHash("sha256")
    .update(assuranceCaseHashDomain, "utf8")
    .update(canonicalJsonV1(assuranceCaseWithoutHash), "utf8")
    .digest("hex");

  return `sha256:${digest}`;
}
