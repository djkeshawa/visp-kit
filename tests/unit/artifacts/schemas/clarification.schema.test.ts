import { describe, expect, it } from "vitest";

import { clarificationArtifactSchema } from "../../../../src/artifacts/schemas/clarification.schema.js";

describe("clarification schema", () => {
  it("accepts valid clarification artifacts", () => {
    expect(
      clarificationArtifactSchema.safeParse({
        featureId: "001",
        featureSlug: "add-note-pinning",
        status: "draft",
        questions: [
          {
            id: "CQ001",
            question: "TBD",
            category: "behavior",
            blocking: true,
            recommendedDefault: "TBD",
            reason: "TBD",
            status: "unanswered",
            answer: ""
          }
        ],
        assumptions: [
          {
            id: "CA001",
            text: "Follow conventions.",
            reason: "Consistency.",
            source: "constitution",
            accepted: true
          }
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }).success
    ).toBe(true);
  });

  it("rejects invalid question categories", () => {
    const result = clarificationArtifactSchema.safeParse({
      featureId: "001",
      featureSlug: "add-note-pinning",
      status: "draft",
      questions: [
        {
          id: "CQ001",
          question: "TBD",
          category: "cosmetic",
          blocking: true,
          recommendedDefault: "TBD",
          reason: "TBD",
          status: "unanswered",
          answer: ""
        }
      ],
      assumptions: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(result.success).toBe(false);
  });
});
