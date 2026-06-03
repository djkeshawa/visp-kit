import { describe, expect, it } from "vitest";

import { renderReconcileMarkdown } from "../../../src/reconcile/reconcile-report.js";
import { validReconcileReport } from "../artifacts/fixtures.js";

describe("reconcile report renderer", () => {
  it("includes findings and follow-up suggestions", () => {
    const markdown = renderReconcileMarkdown(validReconcileReport);

    expect(markdown).toContain("# Reconciliation Report");
    expect(markdown).toContain("REC001");
    expect(markdown).toContain("Follow-up Suggestions");
  });
});
