import { describe, expect, it } from "vitest";

import { reviewReportSchema } from "../../../../src/artifacts/schemas/review.schema.js";
import { validReviewReport } from "../fixtures.js";

describe("review schema", () => {
  it("accepts valid review reports", () => {
    expect(reviewReportSchema.safeParse(validReviewReport).success).toBe(true);
  });

  it("rejects invalid finding severities", () => {
    const result = reviewReportSchema.safeParse({
      ...validReviewReport,
      findings: [
        {
          ...validReviewReport.findings[0],
          severity: "blocker"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative diff counts", () => {
    const result = reviewReportSchema.safeParse({
      ...validReviewReport,
      changedFiles: [
        {
          ...validReviewReport.changedFiles[0],
          additions: -1
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});
