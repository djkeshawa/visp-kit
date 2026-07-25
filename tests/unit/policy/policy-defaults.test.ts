import { describe, expect, it } from "vitest";

import {
  createDefaultPolicy,
  policyRulesForStrictness
} from "../../../src/policy/policy-defaults.js";

describe("policy defaults", () => {
  it("creates standard policy by default", () => {
    const policy = createDefaultPolicy({ now: "2026-01-01T00:00:00.000Z" });

    expect(policy.version).toBe("1.0");
    expect(policy.strictnessMode).toBe("standard");
    expect(policy.rules.requireTasksBeforeContext).toBe(true);
    expect(policy.rules.requireScanBeforeFeature).toBe(false);
    expect(policy.overrides.allowed).toBe(true);
  });

  it("creates strict and locked policy defaults", () => {
    const strict = createDefaultPolicy({
      strictnessMode: "strict",
      now: "2026-01-01T00:00:00.000Z"
    });
    const locked = createDefaultPolicy({
      strictnessMode: "locked",
      now: "2026-01-01T00:00:00.000Z"
    });

    expect(strict.rules.requireScanBeforeFeature).toBe(true);
    expect(strict.limits.maxChangedFilesPerTask).toBe(8);
    expect(strict.overrides.allowed).toBe(true);
    expect(locked.rules.requireScanBeforeFeature).toBe(true);
    expect(locked.limits.maxContextOverBudgetPercent).toBe(0);
    expect(locked.overrides.allowed).toBe(false);
    expect(strict.rules.requireCurrentAssuranceDecisionBeforePr).toBe(true);
    expect(locked.rules.requireCurrentAssuranceDecisionBeforePr).toBe(true);
    expect(strict.overrides.nonOverridableRules).toContain("VSP024");
  });

  it("keeps relaxed and standard assurance decisions opt-in", () => {
    for (const strictnessMode of ["relaxed", "standard"] as const) {
      expect(
        createDefaultPolicy({
          strictnessMode,
          now: "2026-01-01T00:00:00.000Z"
        }).rules.requireCurrentAssuranceDecisionBeforePr
      ).toBe(false);
    }
  });

  it("returns defensive rule copies", () => {
    const first = policyRulesForStrictness("relaxed");
    const second = policyRulesForStrictness("relaxed");

    first.requireScanBeforeFeature = true;

    expect(second.requireScanBeforeFeature).toBe(false);
  });
});
