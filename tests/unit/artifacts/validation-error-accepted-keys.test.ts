import { describe, expect, it } from "vitest";
import { z } from "zod";

import { formatValidationError } from "../../../src/artifacts/validation-error.js";

const decision = z
  .object({
    id: z.string(),
    title: z.string(),
    decision: z.string(),
    reason: z.string(),
    requirementIds: z.array(z.string())
  })
  .strict();

const plan = z.object({ decisions: z.array(decision) }).strict();

function parseFailure(schema: z.ZodTypeAny, value: unknown): z.ZodError {
  const result = schema.safeParse(value);
  if (result.success) throw new Error("expected the value to fail validation");
  return result.error;
}

describe("validation errors name the accepted keys", () => {
  it("lists accepted keys for an unrecognized key inside an array element", () => {
    const error = parseFailure(plan, {
      decisions: [
        {
          id: "PD001",
          title: "t",
          decision: "d",
          reason: "r",
          requirementIds: ["REQ001"],
          alternativesConsidered: ["x"]
        }
      ]
    });

    const message = formatValidationError(error, "plan", plan);

    expect(message).toContain("alternativesConsidered");
    // Without this, an author has to open the schema source to find the real
    // field name, which is what made the plan stage take four attempts.
    expect(message).toContain("accepted keys here:");
    expect(message).toContain("requirementIds");
    expect(message).toContain("reason");
  });

  it("lists accepted keys at the root of an object", () => {
    const error = parseFailure(plan, { decisions: [], notAField: 1 });
    const message = formatValidationError(error, "plan", plan);

    expect(message).toContain("accepted keys here: decisions");
  });

  it("omits the hint when no schema is supplied, preserving prior output", () => {
    const error = parseFailure(plan, { decisions: [], notAField: 1 });

    expect(formatValidationError(error, "plan")).not.toContain("accepted keys here:");
  });

  it("still reports every issue it is given", () => {
    const error = parseFailure(plan, { decisions: "not-an-array", notAField: 1 });
    const message = formatValidationError(error, "plan", plan);

    expect(message.split("\n").length).toBeGreaterThanOrEqual(3);
  });
});
