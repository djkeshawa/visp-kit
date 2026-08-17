import { describe, expect, it } from "vitest";

import { type DriftFinding } from "../../../src/artifacts/schemas/drift.schema.js";
import { driftRecoveryPlan } from "../../../src/drift/drift-recovery.js";

function finding(overrides: Partial<DriftFinding> = {}): DriftFinding {
  return {
    id: "DRF-001",
    kind: "stale_context_provenance",
    severity: "error",
    taskId: "T001",
    file: ".visp/features/001-demo/spec.json",
    expectedHash: "aaa",
    actualHash: "bbb",
    evidence: "Specification changed after the context pack for T001 was compiled.",
    recommendation: "visp-kit context T001 --force",
    ...overrides
  };
}

describe("driftRecoveryPlan", () => {
  it("asks for nothing when there is no blocking drift", () => {
    expect(driftRecoveryPlan({ findings: [], contextPackTaskIds: ["T001"] })).toEqual([]);
  });

  it("rebuilds only the flagged packs, and always with --force", () => {
    const steps = driftRecoveryPlan({
      findings: [finding(), finding({ id: "DRF-002", taskId: "T003" })],
      contextPackTaskIds: ["T001", "T002", "T003"]
    });

    expect(steps.map((step) => step.command)).toEqual([
      "visp-kit context T001 --force",
      "visp-kit context T003 --force"
    ]);
  });

  it("scans first when code drift is reported, because a pack copies its hashes from the cache", () => {
    const steps = driftRecoveryPlan({
      findings: [finding({ kind: "code_changed_after_context", file: "src/app.ts" })],
      contextPackTaskIds: ["T001", "T002"]
    });

    expect(steps[0]?.command).toBe("visp-kit scan");
    expect(steps[0]?.reason).toContain("scan cache");
  });

  it("rebuilds every pack after a scan, not only the flagged one", () => {
    const steps = driftRecoveryPlan({
      findings: [finding({ kind: "code_changed_after_context", file: "src/app.ts" })],
      contextPackTaskIds: ["T002", "T001"]
    });

    expect(steps.map((step) => step.command)).toEqual([
      "visp-kit scan",
      "visp-kit context T001 --force",
      "visp-kit context T002 --force"
    ]);
  });

  it("carries a recommendation it cannot sequence through unchanged", () => {
    const steps = driftRecoveryPlan({
      findings: [
        finding({
          kind: "scope_path_missing",
          taskId: "T004",
          recommendation: "Update T004 allowedFiles or restore the file."
        })
      ],
      contextPackTaskIds: []
    });

    expect(steps.map((step) => step.command)).toEqual([
      "Update T004 allowedFiles or restore the file."
    ]);
  });
});
