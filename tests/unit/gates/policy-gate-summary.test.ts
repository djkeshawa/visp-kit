import { describe, expect, it } from "vitest";

import { type PolicyGateSummary } from "../../../src/artifacts/schemas/gate.schema.js";
import { type StrictnessMode } from "../../../src/artifacts/schemas/policy.schema.js";
import { gateBlocksWorkflow } from "../../../src/gates/policy-gate-summary.js";

function blockedSummary(mode: StrictnessMode): PolicyGateSummary {
  return {
    strictnessMode: mode,
    policyStatus: "valid",
    stage: "implement",
    allowed: false,
    failedRules: [
      {
        ruleId: "VSP007",
        severity: "error",
        message: "Implementation requires a context pack.",
        recommendation: "Run visp context --next.",
        evidence: "Task context JSON was not found."
      }
    ],
    blockedCommands: [
      {
        command: "implementation",
        reason: "Implementation requires a context pack.",
        ruleId: "VSP007"
      }
    ],
    overriddenRules: [],
    appliedOverrides: [],
    warnings: [],
    nextAllowedCommand: "Run visp context --next.",
    evaluatedAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("gateBlocksWorkflow", () => {
  it("never blocks when the gate is allowed, regardless of mode or force", () => {
    for (const mode of ["relaxed", "standard", "strict", "locked"] as const) {
      const allowed: PolicyGateSummary = { ...blockedSummary(mode), allowed: true };
      expect(gateBlocksWorkflow({ gate: allowed, force: false })).toBe(false);
      expect(gateBlocksWorkflow({ gate: allowed, force: true })).toBe(false);
    }
  });

  describe("relaxed mode", () => {
    it("blocks without force", () => {
      expect(gateBlocksWorkflow({ gate: blockedSummary("relaxed"), force: false })).toBe(true);
    });

    it("lets force downgrade the block", () => {
      expect(gateBlocksWorkflow({ gate: blockedSummary("relaxed"), force: true })).toBe(false);
    });
  });

  describe("standard mode", () => {
    it("blocks without force", () => {
      expect(gateBlocksWorkflow({ gate: blockedSummary("standard"), force: false })).toBe(true);
    });

    it("lets force downgrade the block", () => {
      expect(gateBlocksWorkflow({ gate: blockedSummary("standard"), force: true })).toBe(false);
    });
  });

  describe("strict mode", () => {
    it("blocks without force", () => {
      expect(gateBlocksWorkflow({ gate: blockedSummary("strict"), force: false })).toBe(true);
    });

    it("still blocks even with force (force cannot bypass strict gate blocks)", () => {
      expect(gateBlocksWorkflow({ gate: blockedSummary("strict"), force: true })).toBe(true);
    });
  });

  describe("locked mode", () => {
    it("blocks without force", () => {
      expect(gateBlocksWorkflow({ gate: blockedSummary("locked"), force: false })).toBe(true);
    });

    it("still blocks even with force (force cannot bypass locked gate blocks)", () => {
      expect(gateBlocksWorkflow({ gate: blockedSummary("locked"), force: true })).toBe(true);
    });
  });
});
