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

  it("accepts active feature status artifacts", () => {
    expect(
      projectStatusSchema.safeParse({
        initialized: true,
        activeFeatureId: "001",
        activeFeatureSlug: "add-note-pinning",
        activeFeaturePath: ".visp/features/001-add-note-pinning",
        currentState: "feature_intent_ready",
        lastCommand: "feature",
        createdAt: validProjectConfig.createdAt,
        updatedAt: validProjectConfig.updatedAt
      }).success
    ).toBe(true);
  });

  it("accepts phase 7 workflow status artifacts", () => {
    const states = [
      ["clarification_ready", "clarify"],
      ["spec_ready", "spec"],
      ["plan_ready", "plan"],
      ["tasks_ready", "tasks"],
      ["context_ready", "context"],
      ["verified", "verify"],
      ["review_ready", "review"],
      ["reconcile_ready", "reconcile"],
      ["reconciled", "reconcile"],
      ["pr_ready", "pr"]
    ] as const;

    for (const [currentState, lastCommand] of states) {
      expect(
        projectStatusSchema.safeParse({
          initialized: true,
          activeFeatureId: "001",
          activeFeatureSlug: "add-note-pinning",
          activeFeaturePath: ".visp/features/001-add-note-pinning",
          activeTaskId: currentState === "context_ready" ? "T001" : null,
          currentState,
          lastCommand,
          createdAt: validProjectConfig.createdAt,
          updatedAt: validProjectConfig.updatedAt
        }).success
      ).toBe(true);
    }
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

  it("accepts core language presets", () => {
    for (const preset of ["go", "java", "python", "rust"] as const) {
      expect(
        projectConfigSchema.safeParse({
          ...validProjectConfig,
          preset
        }).success
      ).toBe(true);
    }
  });
});
