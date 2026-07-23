import { describe, expect, it } from "vitest";

import {
  selectAssuranceProfile,
  type AssuranceProfileSelectionInput
} from "../../../src/assurance/assurance-profile.js";

function input(
  overrides: Partial<AssuranceProfileSelectionInput> = {}
): AssuranceProfileSelectionInput {
  return {
    taskClass: "documentation",
    riskLevel: "low",
    riskFactors: [],
    changedPaths: ["docs/guide.md"],
    ...overrides
  };
}

describe("assurance profile selection", () => {
  it.each([
    ["documentation", "routine"],
    ["regression_test", "routine"],
    ["refactor", "routine"],
    ["localized_bug", "behavioral"],
    ["bounded_feature", "behavioral"],
    ["cross_file_change", "behavioral"],
    ["migration", "critical"],
    ["security", "critical"]
  ] as const)("maps %s tasks to a deterministic minimum", (taskClass, profile) => {
    expect(selectAssuranceProfile(input({ taskClass })).calculatedProfile).toBe(profile);
  });

  it("raises medium risk to behavioral and high risk to critical", () => {
    expect(selectAssuranceProfile(input({ riskLevel: "medium" })).selectedProfile).toBe(
      "behavioral"
    );
    expect(selectAssuranceProfile(input({ riskLevel: "high" })).selectedProfile).toBe("critical");
  });

  it("raises every declared critical risk factor to critical", () => {
    expect(
      selectAssuranceProfile(
        input({
          riskFactors: [{ version: "1.0", code: "public_api" }]
        })
      ).selectedProfile
    ).toBe("critical");
  });

  it.each([
    "src/auth/session.ts",
    "db/migrations/002_users.sql",
    ".github/workflows/release.yml",
    "pnpm-lock.yaml"
  ])("raises critical changed area %s to critical", (changedPath) => {
    const selection = selectAssuranceProfile(input({ changedPaths: [changedPath] }));

    expect(selection.selectedProfile).toBe("critical");
    expect(selection.reasons.some((reason) => reason.source === "changed_area")).toBe(true);
  });

  it("allows project policy to raise the calculated profile", () => {
    const selection = selectAssuranceProfile(input({ policyProfile: "behavioral" }));

    expect(selection.calculatedProfile).toBe("routine");
    expect(selection.selectedProfile).toBe("behavioral");
    expect(selection.appliedOverrideId).toBeNull();
  });

  it("does not treat documentation about a critical area as a critical code change", () => {
    expect(
      selectAssuranceProfile(input({ changedPaths: ["docs/authentication.md"] })).selectedProfile
    ).toBe("routine");
  });

  it("rejects a downward policy profile without an auditable override", () => {
    const selection = selectAssuranceProfile(
      input({ taskClass: "bounded_feature", policyProfile: "routine" })
    );

    expect(selection.calculatedProfile).toBe("behavioral");
    expect(selection.selectedProfile).toBe("behavioral");
    expect(selection.reasons.map((reason) => reason.code)).toContain(
      "policy_lowering_requires_override"
    );
  });

  it("applies a downward profile only with a VSP022 override", () => {
    const selection = selectAssuranceProfile(
      input({
        taskClass: "bounded_feature",
        policyProfile: "routine",
        loweringOverride: {
          overrideId: "OVR001",
          ruleId: "VSP022",
          reason: "A human accepted routine assurance for this bounded task."
        }
      })
    );

    expect(selection.selectedProfile).toBe("routine");
    expect(selection.appliedOverrideId).toBe("OVR001");
  });

  it("does not accept an override for another rule", () => {
    const selection = selectAssuranceProfile(
      input({
        taskClass: "bounded_feature",
        policyProfile: "routine",
        loweringOverride: {
          overrideId: "OVR001",
          ruleId: "VSP014",
          reason: "This override applies to verification, not assurance."
        }
      })
    );

    expect(selection.selectedProfile).toBe("behavioral");
    expect(selection.appliedOverrideId).toBeNull();
  });

  it("is independent of input path and factor order", () => {
    const first = selectAssuranceProfile(
      input({
        changedPaths: ["src/auth/session.ts", "pnpm-lock.yaml"],
        riskFactors: [
          { version: "1.0", code: "dependency" },
          { version: "1.0", code: "authentication" }
        ]
      })
    );
    const second = selectAssuranceProfile(
      input({
        changedPaths: ["pnpm-lock.yaml", "src/auth/session.ts"],
        riskFactors: [
          { version: "1.0", code: "authentication" },
          { version: "1.0", code: "dependency" }
        ]
      })
    );

    expect(first).toEqual(second);
  });
});
