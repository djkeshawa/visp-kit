import { describe, expect, it } from "vitest";

import {
  numberReconcileFindings,
  reconcileFinding
} from "../../../src/reconcile/reconcile-findings.js";

describe("reconcile findings", () => {
  it("assigns stable sequential IDs", () => {
    const findings = numberReconcileFindings([
      reconcileFinding({
        category: "file-mapping",
        severity: "warning",
        driftType: "unmapped_file_change",
        title: "Unmapped file",
        description: "A file is not mapped.",
        evidence: "src/extra.ts",
        recommendation: "Create a follow-up task."
      }),
      reconcileFinding({
        category: "verification",
        severity: "error",
        driftType: "verification_failed",
        title: "Verification failed",
        description: "Verification did not pass.",
        evidence: "pnpm test failed",
        recommendation: "Fix and rerun verification."
      })
    ]);

    expect(findings.map((finding) => finding.id)).toEqual(["REC001", "REC002"]);
  });
});
