import { describe, expect, it } from "vitest";

import {
  createDefaultPolicy,
  policyRulesForStrictness,
  resolvePolicyRules
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

  it("requires an oracle lock in locked mode only", () => {
    expect(policyRulesForStrictness("locked").requireOracleLockBeforeImplementation).toBe(true);

    for (const strictnessMode of ["relaxed", "standard", "strict"] as const) {
      expect(policyRulesForStrictness(strictnessMode).requireOracleLockBeforeImplementation).toBe(
        false
      );
    }
  });

  it("leaves the understanding gate off in every preset, locked included", () => {
    // A decision, not a gap, and this test is where a future sweep meets it.
    // VSP026's precondition is `.visp-intel/understanding/<task>.json`, which
    // only `visp-intel` writes — Kit has no command that produces it. A preset
    // that turned the rule on would block every behavioural task in a project
    // that does not run intel, and in `locked` (overrides.allowed: false) with
    // no way out but hand-editing policy. The projects the rule CAN protect
    // reach it through `understandingGateActive`, which activates on an
    // exported case. See the argument in src/policy/policy-defaults.ts.
    for (const strictnessMode of ["relaxed", "standard", "strict", "locked"] as const) {
      expect(
        policyRulesForStrictness(strictnessMode).requireUnderstandingBeforeBehaviouralImplementation
      ).toBe(false);
    }
  });

  it("keeps locked identical to strict apart from the oracle lock rule", () => {
    const strict = policyRulesForStrictness("strict");
    const locked = policyRulesForStrictness("locked");

    expect({ ...locked, requireOracleLockBeforeImplementation: false }).toStrictEqual(strict);
  });

  it("resolves rule keys a stored policy omits to its strictness defaults", () => {
    // A `.visp/policy.json` written before VSP021-VSP026 existed: the rules
    // object stops at stopOnFailedGate, and every gate read the missing keys as
    // off, so the file claimed a strictness it did not carry.
    const legacyStrict = {
      ...policyRulesForStrictness("strict"),
      blockOnUnresolvedDrift: undefined,
      preventAssuranceProfileLowering: undefined,
      requireOracleLockBeforeImplementation: undefined,
      requireCurrentAssuranceDecisionBeforePr: undefined,
      requireSignedAssuranceDecision: undefined,
      requireUnderstandingBeforeBehaviouralImplementation: undefined
    };

    const resolved = resolvePolicyRules(legacyStrict, "strict");

    expect(resolved.rules).toStrictEqual(policyRulesForStrictness("strict"));
    expect(resolved.filledKeys).toStrictEqual([
      "blockOnUnresolvedDrift",
      "preventAssuranceProfileLowering",
      "requireOracleLockBeforeImplementation",
      "requireCurrentAssuranceDecisionBeforePr",
      "requireSignedAssuranceDecision",
      "requireUnderstandingBeforeBehaviouralImplementation"
    ]);
  });

  it("turns the oracle lock on when a legacy locked policy omits the key", () => {
    const resolved = resolvePolicyRules(
      { ...policyRulesForStrictness("locked"), requireOracleLockBeforeImplementation: undefined },
      "locked"
    );

    expect(resolved.rules.requireOracleLockBeforeImplementation).toBe(true);
    expect(resolved.filledKeys).toStrictEqual(["requireOracleLockBeforeImplementation"]);
  });

  it("preserves a rule a project explicitly switched off", () => {
    // `false` is a decision and survives resolution; only absence is filled.
    // This is the documented opt-out for a locked project that does not want
    // the pre-implementation baseline.
    const resolved = resolvePolicyRules(
      { ...policyRulesForStrictness("locked"), requireOracleLockBeforeImplementation: false },
      "locked"
    );

    expect(resolved.rules.requireOracleLockBeforeImplementation).toBe(false);
    expect(resolved.filledKeys).toStrictEqual([]);
  });

  it("returns defensive rule copies", () => {
    const first = policyRulesForStrictness("relaxed");
    const second = policyRulesForStrictness("relaxed");

    first.requireScanBeforeFeature = true;

    expect(second.requireScanBeforeFeature).toBe(false);
  });
});
