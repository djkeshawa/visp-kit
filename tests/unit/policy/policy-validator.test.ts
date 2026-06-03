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
});
