import { describe, expect, it } from "vitest";

import {
  agentWorkflowMapSchema,
  installedAgentTargetsSchema
} from "../../../../src/artifacts/schemas/agent.schema.js";

describe("agent schemas", () => {
  it("validates installed agent target metadata", () => {
    const parsed = installedAgentTargetsSchema.safeParse({
      installedTargets: [
        {
          target: "codex",
          strictnessMode: "strict",
          installedAt: "2026-01-01T00:00:00.000Z",
          refreshedAt: "2026-01-01T00:00:00.000Z",
          files: ["AGENTS.md"],
          version: "1.0",
          warnings: []
        }
      ]
    });

    expect(parsed.success).toBe(true);
  });

  it("validates workflow map metadata", () => {
    const parsed = agentWorkflowMapSchema.safeParse({
      workflows: [
        {
          name: "visp-feature",
          purpose: "Start a feature",
          entrypointFile: ".agents/skills/visp-feature/SKILL.md",
          requiredVispCommands: ["visp status"],
          hardStops: ["failed gate"],
          nextRecommendedCommand: "visp next"
        }
      ]
    });

    expect(parsed.success).toBe(true);
  });
});
