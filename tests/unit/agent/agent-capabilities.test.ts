import { describe, expect, it } from "vitest";

import { agentCapabilitiesSchema } from "../../../src/artifacts/schemas/agent.schema.js";
import { buildAgentCapabilities } from "../../../src/agent/agent-capabilities.js";

describe("agent capabilities", () => {
  it("renders capability profiles for installed targets", () => {
    const capabilities = buildAgentCapabilities({
      generatedAt: "2026-01-01T00:00:00.000Z",
      metadata: {
        installedTargets: [
          {
            target: "codex",
            strictnessMode: "strict",
            installedAt: "2026-01-01T00:00:00.000Z",
            refreshedAt: "2026-01-01T00:00:00.000Z",
            files: ["AGENTS.md"],
            version: "1.0",
            warnings: []
          },
          {
            target: "copilot",
            strictnessMode: "strict",
            installedAt: "2026-01-01T00:00:00.000Z",
            refreshedAt: "2026-01-01T00:00:00.000Z",
            files: [".github/copilot-instructions.md"],
            version: "1.0",
            warnings: []
          }
        ]
      }
    });

    expect(agentCapabilitiesSchema.safeParse(capabilities).success).toBe(true);
    expect(capabilities.capabilities.map((item) => item.target)).toEqual(["codex", "copilot"]);
    expect(capabilities.capabilities[0]?.limitations.join(" ")).toContain("does not call or run");
  });
});
