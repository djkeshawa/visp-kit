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
      parsed.data.requirements[0]?.acceptanceCriteria.map((criterion) => criterion.validationMethod)
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

  it("lifts a criterion written only inside its requirement into the top-level list", () => {
    const result = normalizeSpecArtifact({ ...baseSpec, acceptanceCriteria: [] });
    const parsed = specArtifactSchema.safeParse(result.value);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected normalized spec to parse.");

    expect(parsed.data.acceptanceCriteria.map((criterion) => criterion.id)).toEqual([
      "AC001",
      "AC002"
    ]);
    expect(result.changes.join("\n")).toContain("AC001");
  });

  it("copies a criterion written only in the top-level list into its requirement", () => {
    const result = normalizeSpecArtifact({
      ...baseSpec,
      requirements: [{ ...baseSpec.requirements[0], acceptanceCriteria: [] }]
    });
    const parsed = specArtifactSchema.safeParse(result.value);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected normalized spec to parse.");

    expect(
      parsed.data.requirements[0]?.acceptanceCriteria.map((criterion) => criterion.id)
    ).toEqual(["AC001", "AC002"]);
  });

  it("leaves a spec that already states both lists unchanged", () => {
    const result = normalizeSpecArtifact(baseSpec);

    expect(result.changes.join("\n")).not.toContain("acceptance criterion");
    expect(result.conflicts).toEqual([]);
  });

  // The mirror unions by id. Two declarations of one id that disagree are a
  // question Kit cannot answer: picking either one silently rewrites or
  // discards an acceptance claim the author stated, in the artifact verify and
  // review treat as the definition of done.
  it("refuses a spec whose two declarations of one criterion id disagree", () => {
    const result = normalizeSpecArtifact({
      ...baseSpec,
      acceptanceCriteria: [
        baseSpec.acceptanceCriteria[0],
        { ...baseSpec.acceptanceCriteria[1]!, description: "No regression tests are needed." }
      ]
    });

    expect(result.conflicts.join("\n")).toContain("AC002");
    expect(result.conflicts.join("\n")).toContain("requirement REQ001");
    expect(result.conflicts.join("\n")).not.toContain("AC001");
  });

  it("leaves both criterion lists untouched when it refuses", () => {
    const conflicted = {
      ...baseSpec,
      requirements: [
        {
          ...baseSpec.requirements[0]!,
          acceptanceCriteria: [
            baseSpec.requirements[0]!.acceptanceCriteria[0],
            {
              ...baseSpec.requirements[0]!.acceptanceCriteria[1]!,
              description: "No regression tests are needed."
            }
          ]
        }
      ]
    };
    const result = normalizeSpecArtifact(conflicted) as {
      value: {
        acceptanceCriteria: { id: string; description: string }[];
        requirements: { acceptanceCriteria: { id: string; description: string }[] }[];
      };
      conflicts: readonly string[];
    };

    expect(result.conflicts.length).toBe(1);
    // Neither declaration was copied over the other, and neither list grew, so
    // the file the error names still shows the disagreement it is about.
    expect(result.value.acceptanceCriteria).toHaveLength(2);
    expect(result.value.requirements[0]?.acceptanceCriteria).toHaveLength(2);
    expect(
      result.value.acceptanceCriteria.find((criterion) => criterion.id === "AC002")?.description
    ).toBe("Regression tests are run.");
    expect(
      result.value.requirements[0]?.acceptanceCriteria.find((criterion) => criterion.id === "AC002")
        ?.description
    ).toBe("No regression tests are needed.");
  });

  // Two declarations differing only by a spelling the normalizer corrects are
  // the same criterion, not a conflict; the mirror runs after both lists are
  // normalized so that this stays true.
  it("accepts two declarations that differ only by an enum spelling it corrects", () => {
    const result = normalizeSpecArtifact({
      ...baseSpec,
      acceptanceCriteria: [
        baseSpec.acceptanceCriteria[0],
        { ...baseSpec.acceptanceCriteria[1]!, validationMethod: "automated tests" }
      ]
    });

    expect(result.conflicts).toEqual([]);
  });

  it("refuses one list that declares the same criterion id twice with different content", () => {
    const result = normalizeSpecArtifact({
      ...baseSpec,
      requirements: [{ ...baseSpec.requirements[0]!, acceptanceCriteria: [] }],
      acceptanceCriteria: [
        ...baseSpec.acceptanceCriteria,
        { ...baseSpec.acceptanceCriteria[0]!, description: "Issues are ignored." }
      ]
    });

    expect(result.conflicts).toEqual([
      "acceptance criterion AC001 is declared with different content in the top-level acceptanceCriteria list twice"
    ]);
  });
});
