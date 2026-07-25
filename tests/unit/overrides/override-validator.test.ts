import { describe, expect, it } from "vitest";

import {
  overrideArtifactSchema,
  type OverrideArtifact
} from "../../../src/artifacts/schemas/override.schema.js";
import { createDefaultPolicy } from "../../../src/policy/policy-defaults.js";
import { validateOverrideReason } from "../../../src/overrides/override-reason.js";
import {
  isKnownPolicyRule,
  isNonOverridableRule,
  validateOverrideArtifact
} from "../../../src/overrides/override-validator.js";

describe("override validator", () => {
  it("rejects short and placeholder reasons", () => {
    expect(validateOverrideReason("test")).not.toEqual([]);
    expect(validateOverrideReason("skip")).not.toEqual([]);
    expect(validateOverrideReason("reasonable prototype exception")).toEqual([]);
  });

  it("recognizes known and non-overridable rules", () => {
    const policy = createDefaultPolicy({ now: "2026-01-01T00:00:00.000Z" });

    expect(isKnownPolicyRule("VSP014")).toBe(true);
    expect(isKnownPolicyRule("VSP999")).toBe(false);
    expect(isNonOverridableRule({ ruleId: "VSP019", policy })).toBe(true);
    expect(isKnownPolicyRule("VSP023")).toBe(true);
    expect(isNonOverridableRule({ ruleId: "VSP023", policy })).toBe(true);
    expect(isKnownPolicyRule("VSP024")).toBe(true);
    expect(isNonOverridableRule({ ruleId: "VSP024", policy })).toBe(true);
    expect(isNonOverridableRule({ ruleId: "VSP014", policy })).toBe(false);
  });

  it("keeps the authorization core protected even when the policy array is tampered", () => {
    const policy = createDefaultPolicy({ now: "2026-01-01T00:00:00.000Z" });
    const tampered = {
      ...policy,
      overrides: {
        ...policy.overrides,
        nonOverridableRules: [] as string[]
      }
    } as typeof policy;

    expect(isNonOverridableRule({ ruleId: "VSP019", policy: tampered })).toBe(true);
    expect(isNonOverridableRule({ ruleId: "VSP020", policy: tampered })).toBe(true);
    expect(isNonOverridableRule({ ruleId: "VSP023", policy: tampered })).toBe(true);
    expect(isNonOverridableRule({ ruleId: "VSP024", policy: tampered })).toBe(true);
    expect(isNonOverridableRule({ ruleId: "VSP014", policy: tampered })).toBe(false);
  });

  it("validates a scoped override artifact", () => {
    const policy = createDefaultPolicy({ now: "2026-01-01T00:00:00.000Z" });
    const artifact: OverrideArtifact = {
      version: "1.0",
      overrides: [
        {
          id: "OVR001",
          ruleId: "VSP014",
          scope: "task",
          featureId: "001",
          featureSlug: "add-note-pinning",
          taskId: "T001",
          stage: "review",
          reason: "Prototype branch uses manual validation for this review.",
          status: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
          createdBy: "local-user",
          expiresAt: null,
          revokedAt: null,
          revokedReason: null
        }
      ]
    };

    expect(overrideArtifactSchema.safeParse(artifact).success).toBe(true);
    expect(
      validateOverrideArtifact({ artifact, policy, now: "2026-01-01T00:00:00.000Z" }).passed
    ).toBe(true);
  });
});
