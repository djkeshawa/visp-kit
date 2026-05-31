import { describe, expect, it } from "vitest";

import { traceabilityMatrixSchema } from "../../../../src/artifacts/schemas/traceability.schema.js";
import { validTraceabilityMatrix } from "../fixtures.js";

describe("traceability schema", () => {
  it("accepts valid traceability matrices", () => {
    expect(traceabilityMatrixSchema.safeParse(validTraceabilityMatrix).success).toBe(
      true
    );
  });

  it("rejects invalid traceability statuses", () => {
    const result = traceabilityMatrixSchema.safeParse({
      ...validTraceabilityMatrix,
      entries: [{ ...validTraceabilityMatrix.entries[0], status: "stale" }]
    });

    expect(result.success).toBe(false);
  });
});
