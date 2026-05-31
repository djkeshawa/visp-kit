import { describe, expect, it } from "vitest";

import { requirementSchema } from "../../../../src/artifacts/schemas/requirement.schema.js";
import { validRequirement } from "../fixtures.js";

describe("requirement schema", () => {
  it("accepts valid requirements with acceptance criteria", () => {
    expect(requirementSchema.safeParse(validRequirement).success).toBe(true);
  });

  it("rejects invalid requirement sources", () => {
    const result = requirementSchema.safeParse({
      ...validRequirement,
      source: "scanner"
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid acceptance criterion validation methods", () => {
    const result = requirementSchema.safeParse({
      ...validRequirement,
      acceptanceCriteria: [
        {
          ...validRequirement.acceptanceCriteria[0],
          validationMethod: "snapshot"
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});
