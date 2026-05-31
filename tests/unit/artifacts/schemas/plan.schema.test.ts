import { describe, expect, it } from "vitest";

import { planArtifactSchema } from "../../../../src/artifacts/schemas/plan.schema.js";
import { validPlan } from "../fixtures.js";

describe("plan schema", () => {
  it("accepts valid plan artifacts with decisions", () => {
    expect(planArtifactSchema.safeParse(validPlan).success).toBe(true);
  });

  it("rejects invalid risk levels", () => {
    const result = planArtifactSchema.safeParse({
      ...validPlan,
      risks: [{ ...validPlan.risks[0], level: "critical" }]
    });

    expect(result.success).toBe(false);
  });
});
