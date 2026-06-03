import { describe, expect, it } from "vitest";

import {
  reconcileReviewEvidence,
  reconcileVerificationEvidence
} from "../../../src/reconcile/reconcile-evidence.js";
import {
  validReviewReport,
  validTaskGraph,
  validVerificationReport
} from "../artifacts/fixtures.js";

describe("reconcile evidence", () => {
  it("passes when verification succeeds", () => {
    const result = reconcileVerificationEvidence({
      verification: validVerificationReport,
      task: validTaskGraph.tasks[0],
      force: false
    });

    expect(result.evidence.status).toBe("passed");
  });

  it("fails when verification fails", () => {
    const result = reconcileVerificationEvidence({
      verification: { ...validVerificationReport, success: false },
      task: validTaskGraph.tasks[0],
      force: false
    });

    expect(result.evidence.status).toBe("failed");
    expect(result.findings[0]?.driftType).toBe("verification_failed");
  });

  it("fails missing verification for medium-risk tasks unless forced", () => {
    const result = reconcileVerificationEvidence({
      task: { ...validTaskGraph.tasks[0]!, riskLevel: "medium" },
      force: false
    });

    expect(result.evidence.status).toBe("failed");
  });

  it("passes review warnings and fails review failures", () => {
    const warning = reconcileReviewEvidence({
      review: validReviewReport,
      task: validTaskGraph.tasks[0],
      force: false
    });
    const failed = reconcileReviewEvidence({
      review: { ...validReviewReport, result: "failed", errors: ["scope failed"] },
      task: validTaskGraph.tasks[0],
      force: false
    });

    expect(warning.evidence.status).toBe("warnings");
    expect(warning.findings[0]?.title).toBe("Review warnings remain");
    expect(failed.evidence.status).toBe("failed");
  });
});
