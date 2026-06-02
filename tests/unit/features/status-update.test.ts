import { describe, expect, it } from "vitest";

import { updateStatusForFeatureIntent } from "../../../src/features/status-update.js";

describe("updateStatusForFeatureIntent", () => {
  it("preserves creation time and updates active feature fields", () => {
    const status = updateStatusForFeatureIntent({
      existing: {
        initialized: true,
        activeFeatureId: null,
        currentState: "initialized",
        lastCommand: "init",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      featureId: "001",
      slug: "add-note-pinning",
      featurePath: ".visp/features/001-add-note-pinning",
      now: "2026-01-02T00:00:00.000Z"
    });

    expect(status).toEqual({
      initialized: true,
      activeFeatureId: "001",
      activeFeatureSlug: "add-note-pinning",
      activeFeaturePath: ".visp/features/001-add-note-pinning",
      currentState: "feature_intent_ready",
      lastCommand: "feature",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
  });

  it("creates a minimal valid status when one is missing", () => {
    expect(
      updateStatusForFeatureIntent({
        featureId: "001",
        slug: "add-note-pinning",
        featurePath: ".visp/features/001-add-note-pinning",
        now: "2026-01-02T00:00:00.000Z"
      })
    ).toMatchObject({
      initialized: true,
      activeFeatureId: "001",
      currentState: "feature_intent_ready",
      lastCommand: "feature"
    });
  });
});
