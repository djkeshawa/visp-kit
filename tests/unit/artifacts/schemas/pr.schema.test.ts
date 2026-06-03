import { describe, expect, it } from "vitest";

import { prArtifactSchema } from "../../../../src/artifacts/schemas/pr.schema.js";
import { validPrArtifact } from "../fixtures.js";

describe("PR schema", () => {
  it("accepts valid PR artifacts", () => {
    expect(prArtifactSchema.safeParse(validPrArtifact).success).toBe(true);
  });

  it("rejects invalid changed file counts", () => {
    const result = prArtifactSchema.safeParse({
      ...validPrArtifact,
      changedFiles: [
        {
          ...validPrArtifact.changedFiles[0],
          additions: -1
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});
