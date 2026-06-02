import { describe, expect, it } from "vitest";

import { specArtifactSchema } from "../../../../src/artifacts/schemas/spec.schema.js";

describe("spec schema", () => {
  it("accepts valid spec artifacts", () => {
    expect(
      specArtifactSchema.safeParse({
        featureId: "001",
        featureSlug: "add-note-pinning",
        title: "Add note pinning",
        status: "draft",
        userStories: [
          {
            id: "US001",
            title: "TBD",
            actor: "user",
            capability: "pin notes",
            outcome: "find notes"
          }
        ],
        requirements: [
          {
            id: "REQ001",
            featureId: "001",
            title: "TBD",
            description: "TBD",
            source: "user",
            priority: "must",
            acceptanceCriteria: [
              {
                id: "AC001",
                requirementId: "REQ001",
                description: "TBD",
                testable: true,
                validationMethod: "unit"
              }
            ],
            assumptions: [],
            outOfScope: []
          }
        ],
        acceptanceCriteria: [
          {
            id: "AC001",
            requirementId: "REQ001",
            description: "TBD",
            testable: true,
            validationMethod: "unit"
          }
        ],
        businessRules: ["TBD"],
        nonFunctionalRequirements: {
          performance: ["TBD"],
          security: ["TBD"],
          accessibility: ["TBD"],
          reliability: ["TBD"],
          maintainability: ["TBD"]
        },
        edgeCases: ["TBD"],
        assumptions: [],
        outOfScope: ["TBD"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }).success
    ).toBe(true);
  });
});
