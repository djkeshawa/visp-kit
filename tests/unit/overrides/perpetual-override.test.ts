import { describe, expect, it } from "vitest";

import { validateOverrideArtifact } from "../../../src/overrides/override-validator.js";

const now = "2026-01-01T00:00:00.000Z";

const override = (overrides: Record<string, unknown> = {}) => ({
  id: "OVR001",
  ruleId: "VSP001",
  scope: "repository" as const,
  reason: "Temporarily bypassed while the upstream provider is down.",
  status: "active" as const,
  createdAt: now,
  createdBy: "operator",
  ...overrides
});

const artifact = (records: unknown[]) =>
  ({ version: 1, overrides: records, updatedAt: now }) as never;

const policy = (strictnessMode: string) =>
  ({
    strictnessMode,
    overrides: { nonOverridableRules: [], allowedInLockedMode: true }
  }) as never;

describe("overrides that never expire", () => {
  it("is counted and warned about in standard mode", () => {
    const result = validateOverrideArtifact({
      artifact: artifact([override()]),
      policy: policy("standard"),
      now
    });

    expect(result.counts.perpetual).toBe(1);
    expect(result.warnings.join("\n")).toContain("has no expiry");
    // A warning must not fail the run in standard mode; existing projects with
    // perpetual overrides should learn about them, not be blocked by them.
    expect(result.passed).toBe(true);
  });

  it("warns rather than blocks, even in strict and locked mode", () => {
    for (const mode of ["strict", "locked"]) {
      const result = validateOverrideArtifact({
        artifact: artifact([override()]),
        policy: policy(mode),
        now
      });

      // Blocking was the first instinct and it is wrong: some exemptions are
      // legitimately permanent, and there is no way to declare that yet, so an
      // error would leave those projects with no correct move. Revoking the
      // override removes an exemption they actually need.
      expect(result.passed, mode).toBe(true);
      expect(result.warnings.join("\n"), mode).toContain("never returns for review");
    }
  });

  it("names the rule and the remedy", () => {
    const result = validateOverrideArtifact({
      artifact: artifact([override({ ruleId: "VSP007" })]),
      policy: policy("standard"),
      now
    });
    const message = result.warnings.join("\n");

    expect(message).toContain("VSP007");
    expect(message).toContain("Set expiresAt");
  });

  it("does not fire for an override that has an expiry", () => {
    const result = validateOverrideArtifact({
      artifact: artifact([override({ expiresAt: "2026-06-01T00:00:00.000Z" })]),
      policy: policy("strict"),
      now
    });

    expect(result.counts.perpetual).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("does not fire for a revoked override with no expiry", () => {
    const result = validateOverrideArtifact({
      artifact: artifact([
        override({ status: "revoked", revokedAt: now, revokedReason: "No longer needed." })
      ]),
      policy: policy("strict"),
      now
    });

    // A revoked override is already closed. Demanding an expiry date for it
    // would be noise that teaches operators to ignore the check.
    expect(result.counts.perpetual).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("does not fire when an explicit null expiry is absent from an inactive record", () => {
    const result = validateOverrideArtifact({
      artifact: artifact([
        override({ expiresAt: null, status: "revoked", revokedAt: now, revokedReason: "Closed." })
      ]),
      policy: policy("strict"),
      now
    });

    expect(result.counts.perpetual).toBe(0);
  });
});
