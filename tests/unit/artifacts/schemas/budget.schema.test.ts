import { describe, expect, it } from "vitest";

import {
  budgetArtifactSchema,
  budgetPolicySchema,
  budgetReportSchema
} from "../../../../src/artifacts/schemas/budget.schema.js";
import { validBudgetArtifact } from "../fixtures.js";

describe("budget schemas", () => {
  it("accepts valid budget policies, reports, and artifacts", () => {
    expect(
      budgetPolicySchema.safeParse(validBudgetArtifact.policies[0]).success
    ).toBe(true);
    expect(budgetReportSchema.safeParse(validBudgetArtifact.reports[0]).success).toBe(
      true
    );
    expect(budgetArtifactSchema.safeParse(validBudgetArtifact).success).toBe(true);
  });

  it("rejects invalid budget modes", () => {
    const result = budgetPolicySchema.safeParse({
      ...validBudgetArtifact.policies[0],
      mode: "unlimited"
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid token limits", () => {
    const result = budgetReportSchema.safeParse({
      ...validBudgetArtifact.reports[0],
      maxEstimatedTokens: 0
    });

    expect(result.success).toBe(false);
  });
});
