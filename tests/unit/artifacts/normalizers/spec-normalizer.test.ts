import { describe, expect, it } from "vitest";

import { normalizeSpecArtifact } from "../../../../src/artifacts/normalizers/spec-normalizer.js";
import { specArtifactSchema } from "../../../../src/artifacts/schemas/spec.schema.js";

const baseSpec = {
  featureId: "001",
  featureSlug: "find-bugs",
  title: "Find bugs",
  status: "draft",
  userStories: [
    {
      id: "US001",
      title: "Find issues",
      actor: "developer",
      capability: "find issues",
      outcome: "fix bugs"
    }
  ],
  requirements: [
    {
      id: "REQ001",
      featureId: "001",
      title: "Find issues",
      description: "Identify bugs in the codebase.",
      source: "constitution",
      priority: "must",
      acceptanceCriteria: [
        {
          id: "AC001",
          requirementId: "REQ001",
          description: "Issues are reviewed.",
          testable: true,
          validationMethod: "review"
        },
        {
          id: "AC002",
          requirementId: "REQ001",
          description: "Regression tests are run.",
          testable: true,
          validationMethod: "test"
        }
      ],
      assumptions: ["Follow existing project conventions."],
      outOfScope: []
    }
  ],
  acceptanceCriteria: [
    {
      id: "AC001",
      requirementId: "REQ001",
      description: "Issues are reviewed.",
      testable: true,
      validationMethod: "review"
    },
    {
      id: "AC002",
      requirementId: "REQ001",
      description: "Regression tests are run.",
      testable: true,
      validationMethod: "test"
    }
  ],
  businessRules: ["Do not invent findings."],
  nonFunctionalRequirements: {
    performance: [],
    security: [],
    accessibility: [],
    reliability: [],
    maintainability: []
  },
  edgeCases: [],
  assumptions: ["Repository state may include user changes."],
  outOfScope: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("spec normalizer", () => {
  it("normalizes common AI-generated enum and assumption mistakes", () => {
    const result = normalizeSpecArtifact(baseSpec);
    const parsed = specArtifactSchema.safeParse(result.value);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected normalized spec to parse.");

    expect(parsed.data.requirements[0]?.source).toBe("derived");
    expect(parsed.data.acceptanceCriteria.map((criterion) => criterion.validationMethod)).toEqual([
      "manual",
      "unit"
    ]);
    expect(
      parsed.data.requirements[0]?.acceptanceCriteria.map(
        (criterion) => criterion.validationMethod
      )
    ).toEqual(["manual", "unit"]);
    expect(parsed.data.assumptions).toEqual([
      {
        id: "ASM001",
        description: "Repository state may include user changes."
      }
    ]);
    expect(parsed.data.requirements[0]?.assumptions).toEqual([
      {
        id: "REQ001-ASM001",
        description: "Follow existing project conventions."
      }
    ]);
    expect(result.changes.join("\n")).toContain("validationMethod");
    expect(result.changes.join("\n")).toContain("source");
  });

  it("normalizes assumption objects that use text instead of description", () => {
    const result = normalizeSpecArtifact({
      ...baseSpec,
      assumptions: [{ id: "ASM010", text: "Use current behavior.", source: "review" }]
    });
    const parsed = specArtifactSchema.safeParse(result.value);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected normalized spec to parse.");

    expect(parsed.data.assumptions).toEqual([
      {
        id: "ASM010",
        description: "Use current behavior."
      }
    ]);
  });
});
