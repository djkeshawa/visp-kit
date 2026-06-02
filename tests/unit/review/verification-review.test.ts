import { describe, expect, it } from "vitest";

import { reviewVerification } from "../../../src/review/verification-review.js";
import { validVerificationReport } from "../artifacts/fixtures.js";

describe("verification review", () => {
  it("reports missing verification as a warning", () => {
    const result = reviewVerification({ taskId: "T001" });

    expect(result.verificationReview.status).toBe("missing");
    expect(result.findings[0]?.severity).toBe("warning");
  });

  it("reports failed verification as an error", () => {
    const result = reviewVerification({
      taskId: "T001",
      verification: {
        ...validVerificationReport,
        success: false,
        errors: ["Command failed: pnpm test"]
      }
    });

    expect(result.verificationReview.status).toBe("failed");
    expect(result.findings[0]?.severity).toBe("error");
  });
});
