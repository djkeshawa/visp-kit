import { describe, expect, it } from "vitest";

import {
  projectConfigSchema,
  projectProfileSchema,
  projectStatusSchema
} from "../../../../src/artifacts/schemas/project.schema.js";
import {
  validProjectConfig,
  validProjectProfile
} from "../fixtures.js";

describe("project schemas", () => {
  it("accepts valid project profile and config artifacts", () => {
    expect(projectProfileSchema.safeParse(validProjectProfile).success).toBe(true);
    expect(projectConfigSchema.safeParse(validProjectConfig).success).toBe(true);
    expect(
      projectStatusSchema.safeParse({
        initialized: true,
        activeFeatureId: null,
        currentState: "initialized",
        lastCommand: "init",
        createdAt: validProjectConfig.createdAt,
        updatedAt: validProjectConfig.updatedAt
      }).success
    ).toBe(true);
  });

  it("rejects invalid package managers", () => {
    const result = projectProfileSchema.safeParse({
      ...validProjectProfile,
      packageManager: "pnpmx"
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown config keys", () => {
    const result = projectConfigSchema.safeParse({
      ...validProjectConfig,
      workflowState: "INITIALIZED"
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid presets", () => {
    const result = projectConfigSchema.safeParse({
      ...validProjectConfig,
      preset: "ruby"
    });

    expect(result.success).toBe(false);
  });
});
