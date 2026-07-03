import { describe, expect, it } from "vitest";

import { constitutionArtifactSchema } from "../../../../src/artifacts/schemas/constitution.schema.js";
import { validConstitution } from "../fixtures.js";

describe("constitution schema", () => {
  it("accepts valid constitution rule artifacts", () => {
    expect(constitutionArtifactSchema.safeParse(validConstitution).success).toBe(true);
  });

  it("rejects invalid rule categories", () => {
    const result = constitutionArtifactSchema.safeParse({
      ...validConstitution,
      rules: [{ ...validConstitution.rules[0], category: "product" }]
    });

    expect(result.success).toBe(false);
  });
});
