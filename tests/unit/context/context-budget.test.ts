import { describe, expect, it } from "vitest";

import {
  contextBudgetPolicy,
  contextBudgetRecommendation
} from "../../../src/context/context-budget.js";

describe("context budget policy", () => {
  it("returns lean policy values", () => {
    const policy = contextBudgetPolicy("lean");

    expect(policy.maxInputTokens).toBe(8000);
    expect(policy.maxFiles).toBe(6);
    expect(policy.includePatterns).toBe(false);
  });

  it("returns balanced and strict limits", () => {
    expect(contextBudgetPolicy("balanced").maxInputTokens).toBe(15000);
    expect(contextBudgetPolicy("strict").maxInputTokens).toBe(30000);
  });

  it("overrides only max input tokens", () => {
    const policy = contextBudgetPolicy("lean", 1000);

    expect(policy.maxInputTokens).toBe(1000);
    expect(policy.maxFiles).toBe(6);
  });

  it("recommends OK when within budget", () => {
    expect(
      contextBudgetRecommendation({
        overBudget: false,
        overBudgetBy: 0,
        hasAllowedFiles: true,
        includeFullFiles: false
      })
    ).toBe("OK");
  });
});
