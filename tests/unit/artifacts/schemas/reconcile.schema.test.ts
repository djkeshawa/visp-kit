import { describe, expect, it } from "vitest";

import { reconcileReportSchema } from "../../../../src/artifacts/schemas/reconcile.schema.js";
import { validReconcileReport } from "../fixtures.js";

describe("reconcile schema", () => {
  it("accepts valid reconciliation reports", () => {
    expect(reconcileReportSchema.safeParse(validReconcileReport).success).toBe(true);
  });

  it("rejects invalid drift types", () => {
    const result = reconcileReportSchema.safeParse({
      ...validReconcileReport,
      findings: [
        {
          ...validReconcileReport.findings[0],
          driftType: "semantic_guess"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative changed file counts", () => {
    const result = reconcileReportSchema.safeParse({
      ...validReconcileReport,
      changedFiles: [
        {
          ...validReconcileReport.changedFiles[0],
          additions: -1
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});
