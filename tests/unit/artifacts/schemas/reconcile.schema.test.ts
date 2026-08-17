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

  it("accepts a reconcile report that records the task status it wrote", () => {
    const result = reconcileReportSchema.safeParse({
      ...validReconcileReport,
      taskStatusUpdate: {
        requested: true,
        performed: true,
        taskId: "T001",
        previousStatus: "ready",
        newStatus: "verified",
        skippedReason: null
      }
    });

    expect(result.success).toBe(true);
  });

  it("still accepts a reconcile report written before task status was recorded", () => {
    expect("taskStatusUpdate" in validReconcileReport).toBe(false);
    expect(reconcileReportSchema.safeParse(validReconcileReport).success).toBe(true);
  });

  it("rejects a task status the graph could never hold", () => {
    const result = reconcileReportSchema.safeParse({
      ...validReconcileReport,
      taskStatusUpdate: {
        requested: true,
        performed: true,
        taskId: "T001",
        previousStatus: "ready",
        newStatus: "finished",
        skippedReason: null
      }
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
