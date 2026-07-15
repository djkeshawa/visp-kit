import { describe, expect, it } from "vitest";

import {
  type GateResult,
  type PolicyGateSummary
} from "../../../src/artifacts/schemas/gate.schema.js";
import { type StrictnessMode } from "../../../src/artifacts/schemas/policy.schema.js";
import { gateBlocksWorkflow, summarizeGateResult } from "../../../src/gates/policy-gate-summary.js";

const policyValidationFailure = {
  ruleId: "VSP018",
  severity: "error" as const,
  message: "Policy validation failed.",
  recommendation: "Run visp policy validate.",
  evidence: ".visp/policy.json could not be parsed."
};

function gateResult(overrides: Partial<GateResult> = {}): GateResult {
  return {
    success: false,
    targetPath: "C:/visp-fixture",
    stage: "verify",
    strictnessMode: "standard",
    allowed: false,
    dryRun: true,
    feature: null,
    taskId: "T001",
    passedRules: [],
    failedRules: [policyValidationFailure],
    warnings: [],
    blockedCommands: [
      {
        command: "visp verify",
        reason: "Policy validation failed.",
        ruleId: "VSP018"
      }
    ],
    overriddenRules: [],
    appliedOverrides: [],
    nextAllowedCommand: "Run visp policy validate.",
    nextCommand: "visp policy validate",
    reportPath: ".visp/gate-report.md",
    evaluatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

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
  it("summarizes a VSP018 policy-validation failure as invalid", () => {
    const summary = summarizeGateResult(gateResult());

    expect(summary.policyStatus).toBe("invalid");
  });

  it("keeps a genuinely missing policy distinct from invalid authority", () => {
    const summary = summarizeGateResult(
      gateResult({
        success: true,
        allowed: true,
        failedRules: [],
        blockedCommands: [],
        warnings: ["Policy file is missing. Run `visp policy init` to persist it."]
      })
    );

    expect(summary.policyStatus).toBe("missing");
  });

  it("keeps a valid policy valid", () => {
    const summary = summarizeGateResult(
      gateResult({
        success: true,
        allowed: true,
        passedRules: ["VSP018"],
        failedRules: [],
        blockedCommands: []
      })
    );

    expect(summary.policyStatus).toBe("valid");
  });

  it.each([
    "relaxed",
    "standard",
    "strict",
    "locked"
  ] as const)("treats invalid policy authority as non-overridable in %s mode", (mode) => {
    const invalidGate: PolicyGateSummary = {
      ...blockedSummary(mode),
      policyStatus: "invalid",
      failedRules: [policyValidationFailure],
      blockedCommands: [
        {
          command: "implementation",
          reason: "Policy validation failed.",
          ruleId: "VSP018"
        }
      ],
      nextAllowedCommand: "Run visp policy validate.",
      nextCommand: "visp policy validate"
    };

    expect(gateBlocksWorkflow({ gate: invalidGate, force: false })).toBe(true);
    expect(gateBlocksWorkflow({ gate: invalidGate, force: true })).toBe(true);
  });

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
