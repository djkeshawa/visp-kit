import { describe, expect, it } from "vitest";

import {
  featureIntentSchema,
  featureSchema
} from "../../../../src/artifacts/schemas/feature.schema.js";
import { validFeature } from "../fixtures.js";

describe("feature schema", () => {
  it("accepts valid feature artifacts", () => {
    expect(featureSchema.safeParse(validFeature).success).toBe(true);
  });

  it("rejects invalid feature statuses", () => {
    const result = featureSchema.safeParse({
      ...validFeature,
      status: "shipped"
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-kebab-case slugs", () => {
    const result = featureSchema.safeParse({
      ...validFeature,
      slug: "Note Pinning"
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid feature intent artifacts", () => {
    const result = featureIntentSchema.safeParse({
      ...validFeature,
      rawUserRequest: "Add note pinning"
    });

    expect(result.success).toBe(true);
  });
});
