import { describe, expect, it } from "vitest";

import { type GateRuleFinding } from "../../../src/artifacts/schemas/gate.schema.js";
import { type OverrideArtifact } from "../../../src/artifacts/schemas/override.schema.js";
import { createDefaultPolicy } from "../../../src/policy/policy-defaults.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";
import { findApplicableOverride } from "../../../src/overrides/override-matcher.js";

const rule: GateRuleFinding = {
  ruleId: "VSP014",
  severity: "error",
  message: "Verification report is missing.",
  recommendation: "Run visp verify --task T001.",
  evidence: "verification.json missing."
};

function state(taskId = "T001"): ProjectState {
  return {
    targetPath: "/repo",
    initialized: true,
    selectedFeature: {
      id: "001",
      slug: "add-note-pinning",
      key: "001-add-note-pinning",
      relativePath: ".visp/features/001-add-note-pinning"
    },
    selectedTask: {
      id: taskId,
      title: "Task",
      description: "Task",
      status: "ready",
      requirementIds: ["REQ001"],
      acceptanceCriterionIds: ["AC001"],
      dependsOn: [],
      allowedFiles: [],
      expectedFiles: [],
      forbiddenFiles: [],
      validationCommands: [],
      parallelizable: false,
      riskLevel: "low"
    },
    artifactSummary: {
      clarifications: false,
      spec: false,
      plan: false,
      taskGraph: false,
      traceability: false,
      context: false,
      verification: false,
      review: false,
      reconcile: false,
      pr: false
    },
    taskSummary: {
      total: 1,
      ready: 1,
      pending: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
      verified: 0
    },
    scanned: false,
    constitution: false,
    scanCacheFiles: {},
    git: {
      isRepo: false,
      branch: null,
      stagedCount: 0,
      unstagedCount: 0,
      changedFiles: [],
      warnings: []
    },
    warnings: [],
    errors: []
  };
}

function artifact(scope: OverrideArtifact["overrides"][number]["scope"]): OverrideArtifact {
  return {
    version: "1.0",
    overrides: [
      {
        id: "OVR001",
        ruleId: "VSP014",
        scope,
        featureId: "001",
        featureSlug: "add-note-pinning",
        taskId: scope === "task" ? "T001" : null,
        stage: scope === "stage" ? "review" : null,
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
}

describe("override matcher", () => {
  it("applies matching task overrides", () => {
    const policy = createDefaultPolicy({
      strictnessMode: "strict",
      now: "2026-01-01T00:00:00.000Z"
    });
    const match = findApplicableOverride({
      rule,
      stage: "review",
      state: state(),
      policy,
      overrides: artifact("task"),
      now: "2026-01-01T00:00:00.000Z"
    });

    expect(match?.overrideId).toBe("OVR001");
  });

  it("does not apply task overrides to another task", () => {
    const policy = createDefaultPolicy({
      strictnessMode: "strict",
      now: "2026-01-01T00:00:00.000Z"
    });
    const match = findApplicableOverride({
      rule,
      stage: "review",
      state: state("T002"),
      policy,
      overrides: artifact("task"),
      now: "2026-01-01T00:00:00.000Z"
    });

    expect(match).toBeUndefined();
  });

  it("does not apply overrides in locked mode by default", () => {
    const policy = createDefaultPolicy({
      strictnessMode: "locked",
      now: "2026-01-01T00:00:00.000Z"
    });
    const match = findApplicableOverride({
      rule,
      stage: "review",
      state: state(),
      policy,
      overrides: artifact("project"),
      now: "2026-01-01T00:00:00.000Z"
    });

    expect(match).toBeUndefined();
  });
});
