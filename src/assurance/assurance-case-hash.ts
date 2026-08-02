import { createHash } from "node:crypto";

import { type AssuranceCaseWithoutHash } from "../artifacts/schemas/assurance-case.schema.js";
import { canonicalJsonV1, type Sha256Hash } from "../integration/canonical-json.js";
import { assuranceCaseHashProjectionV1_1 } from "../integration/hash-projection.js";

export const assuranceCaseHashDomain = "visp.assurance-case\0canonical-1.0\0";
// canonical-1.1 hashes a projection that excludes `nextAction` — command
// wording is guidance, not identity, so a CLI rename can never invalidate a
// stored approval again (D-119, P10-US-01). Version 1.0 cases keep verifying
// under the 1.0 rule against their stored bytes; they are never re-hashed.
export const assuranceCaseHashDomainV1_1 = "visp.assurance-case\0canonical-1.1\0";

function domainSeparatedHash(domain: string, body: unknown): Sha256Hash {
  const digest = createHash("sha256")
    .update(domain, "utf8")
    .update(canonicalJsonV1(body), "utf8")
    .digest("hex");

  return `sha256:${digest}`;
}

export function createAssuranceCaseHash(
  assuranceCaseWithoutHash: AssuranceCaseWithoutHash
): Sha256Hash {
  return domainSeparatedHash(assuranceCaseHashDomain, assuranceCaseWithoutHash);
}

export function createAssuranceCaseHashV1_1(
  assuranceCaseWithoutHash: AssuranceCaseWithoutHash
): Sha256Hash {
  return domainSeparatedHash(
    assuranceCaseHashDomainV1_1,
    assuranceCaseHashProjectionV1_1(assuranceCaseWithoutHash)
  );
}
