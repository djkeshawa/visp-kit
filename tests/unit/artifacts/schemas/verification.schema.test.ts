import { describe, expect, it } from "vitest";

import { verificationReportSchema } from "../../../../src/artifacts/schemas/verification.schema.js";
import { validVerificationReport } from "../fixtures.js";

describe("verification schema", () => {
  it("accepts valid verification reports", () => {
    expect(verificationReportSchema.safeParse(validVerificationReport).success).toBe(
      true
    );
  });

  it("rejects invalid verification statuses", () => {
    const result = verificationReportSchema.safeParse({
      ...validVerificationReport,
      mode: "unknown"
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative command durations", () => {
    const result = verificationReportSchema.safeParse({
      ...validVerificationReport,
      commandValidation: {
        ...validVerificationReport.commandValidation,
        commands: [
          {
            ...validVerificationReport.commandValidation.commands[0],
            durationMs: -1
          }
        ]
      }
    });

    expect(result.success).toBe(false);
  });
});
