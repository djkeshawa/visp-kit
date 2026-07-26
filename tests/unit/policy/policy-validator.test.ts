import { describe, expect, it } from "vitest";

import { createDefaultPolicy } from "../../../src/policy/policy-defaults.js";
import { validatePolicyArtifact } from "../../../src/policy/policy-validator.js";

describe("policy validator", () => {
  it("passes valid policy artifacts", () => {
    const validation = validatePolicyArtifact(
      createDefaultPolicy({ strictnessMode: "strict", now: "2026-01-01T00:00:00.000Z" })
    );

    expect(validation.passed).toBe(true);
    expect(validation.value?.strictnessMode).toBe("strict");
  });

  it("accepts legacy policy files without the optional assurance-decision rule", () => {
    const policy = createDefaultPolicy({
      strictnessMode: "standard",
      now: "2026-01-01T00:00:00.000Z"
    });
    const { requireCurrentAssuranceDecisionBeforePr: _legacyMissing, ...legacyRules } =
      policy.rules;
    const validation = validatePolicyArtifact({
      ...policy,
      rules: legacyRules,
      overrides: {
        ...policy.overrides,
        nonOverridableRules: policy.overrides.nonOverridableRules.filter(
          (rule) => rule !== "VSP024"
        )
      }
    });

    expect(validation.passed).toBe(true);
    expect(validation.value?.rules.requireCurrentAssuranceDecisionBeforePr).toBeUndefined();
  });

  it("rejects strict policies that disable the assurance-decision rule", () => {
    const policy = createDefaultPolicy({
      strictnessMode: "strict",
      now: "2026-01-01T00:00:00.000Z"
    });
    const validation = validatePolicyArtifact({
      ...policy,
      rules: { ...policy.rules, requireCurrentAssuranceDecisionBeforePr: false }
    });

    expect(validation.passed).toBe(false);
    expect(validation.errors.join("\n")).toContain("requireCurrentAssuranceDecisionBeforePr");
  });

  it("rejects locked policies that disable drift blocking", () => {
    const policy = createDefaultPolicy({
      strictnessMode: "locked",
      now: "2026-01-01T00:00:00.000Z"
    });
    const validation = validatePolicyArtifact({
      ...policy,
      rules: { ...policy.rules, blockOnUnresolvedDrift: false }
    });

    expect(validation.passed).toBe(false);
    expect(validation.errors.join("\n")).toContain("blockOnUnresolvedDrift");
  });

  it("still allows standard policies to disable both assurance rules", () => {
    const policy = createDefaultPolicy({
      strictnessMode: "standard",
      now: "2026-01-01T00:00:00.000Z"
    });
    const validation = validatePolicyArtifact({
      ...policy,
      rules: {
        ...policy.rules,
        requireCurrentAssuranceDecisionBeforePr: false,
        blockOnUnresolvedDrift: false
      }
    });

    expect(validation.passed).toBe(true);
  });

  it("rejects invalid strictness modes and unknown rule fields", () => {
    const policy = createDefaultPolicy({ now: "2026-01-01T00:00:00.000Z" });
    const validation = validatePolicyArtifact({
      ...policy,
      strictnessMode: "aggressive",
      rules: {
        ...policy.rules,
        unknownRule: true
      }
    });

    expect(validation.passed).toBe(false);
    expect(validation.errors.join("\n")).toContain("strictnessMode");
    expect(validation.errors.join("\n")).toContain("unknownRule");
  });

  it("rejects unsafe limits", () => {
    const policy = createDefaultPolicy({ now: "2026-01-01T00:00:00.000Z" });
    const validation = validatePolicyArtifact({
      ...policy,
      limits: {
        ...policy.limits,
        maxChangedFilesPerTask: 0,
        maxContextOverBudgetPercent: 120
      }
    });

    expect(validation.passed).toBe(false);
    expect(validation.errors.join("\n")).toContain("maxChangedFilesPerTask");
    expect(validation.errors.join("\n")).toContain("maxContextOverBudgetPercent");
  });

  it("rejects policies that disable the non-overridable core flags", () => {
    const policy = createDefaultPolicy({
      strictnessMode: "locked",
      now: "2026-01-01T00:00:00.000Z"
    });
    const validation = validatePolicyArtifact({
      ...policy,
      rules: {
        ...policy.rules,
        userPromptCannotOverridePolicy: false
      }
    });

    expect(validation.passed).toBe(false);
    expect(validation.errors.join("\n")).toContain("userPromptCannotOverridePolicy");
    expect(validation.errors.join("\n")).toContain("VSP019");
  });

  it("rejects policies that disable stopOnFailedGate", () => {
    const policy = createDefaultPolicy({
      strictnessMode: "strict",
      now: "2026-01-01T00:00:00.000Z"
    });
    const validation = validatePolicyArtifact({
      ...policy,
      rules: {
        ...policy.rules,
        stopOnFailedGate: false
      }
    });

    expect(validation.passed).toBe(false);
    expect(validation.errors.join("\n")).toContain("stopOnFailedGate");
    expect(validation.errors.join("\n")).toContain("VSP020");
  });

  it("rejects policies whose nonOverridableRules omit VSP019", () => {
    const policy = createDefaultPolicy({
      strictnessMode: "strict",
      now: "2026-01-01T00:00:00.000Z"
    });
    const validation = validatePolicyArtifact({
      ...policy,
      overrides: {
        ...policy.overrides,
        nonOverridableRules: ["VSP020"]
      }
    });

    expect(validation.passed).toBe(false);
    expect(validation.errors.join("\n")).toContain("nonOverridableRules");
    expect(validation.errors.join("\n")).toContain("VSP019");
  });

  it("rejects policies whose nonOverridableRules are emptied", () => {
    const policy = createDefaultPolicy({ now: "2026-01-01T00:00:00.000Z" });
    const validation = validatePolicyArtifact({
      ...policy,
      overrides: {
        ...policy.overrides,
        nonOverridableRules: []
      }
    });

    expect(validation.passed).toBe(false);
    expect(validation.errors.join("\n")).toContain("VSP019");
    expect(validation.errors.join("\n")).toContain("VSP020");
  });
});
