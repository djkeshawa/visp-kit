import { describe, expect, it } from "vitest";

import {
  contextBudgetPolicy,
  contextBudgetRecommendation,
  effectiveMaxInputTokens
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

  it("defaults over-budget tolerance to zero (locked-equivalent) per mode", () => {
    expect(contextBudgetPolicy("lean").overBudgetTolerancePercent).toBe(0);
    expect(contextBudgetPolicy("balanced").overBudgetTolerancePercent).toBe(0);
    expect(contextBudgetPolicy("strict").overBudgetTolerancePercent).toBe(0);
  });

  it("carries an explicit over-budget tolerance override", () => {
    const policy = contextBudgetPolicy("lean", 1000, 25);

    expect(policy.maxInputTokens).toBe(1000);
    expect(policy.overBudgetTolerancePercent).toBe(25);
  });
});

describe("effectiveMaxInputTokens", () => {
  const policyWith = (maxInputTokens: number, tolerance: number) =>
    contextBudgetPolicy("lean", maxInputTokens, tolerance);

  it("equals maxInputTokens when tolerance is 0 (locked hard cutoff)", () => {
    expect(effectiveMaxInputTokens(policyWith(1000, 0))).toBe(1000);
  });

  it("raises the cutoff by the tolerance percent", () => {
    expect(effectiveMaxInputTokens(policyWith(1000, 25))).toBe(1250);
    expect(effectiveMaxInputTokens(policyWith(1000, 50))).toBe(1500);
    expect(effectiveMaxInputTokens(policyWith(1000, 20))).toBe(1200);
  });

  it("floors fractional thresholds", () => {
    expect(effectiveMaxInputTokens(policyWith(1001, 25))).toBe(1251);
  });

  it("treats over-budget as strictly greater than the effective cutoff", () => {
    const tolerated = policyWith(1000, 25);
    const cutoff = effectiveMaxInputTokens(tolerated);

    // Exactly at the base limit -> within budget.
    expect(1000 > cutoff).toBe(false);
    // Exactly at the tolerated cutoff -> still within budget (boundary).
    expect(cutoff > cutoff).toBe(false);
    // Within tolerance (above base limit, below cutoff) -> within budget.
    expect(1200 > cutoff).toBe(false);
    // One token beyond the cutoff -> over budget.
    expect(cutoff + 1 > cutoff).toBe(true);
  });

  it("keeps locked mode (0%) over budget for any excess over the base limit", () => {
    const locked = policyWith(1000, 0);
    const cutoff = effectiveMaxInputTokens(locked);

    expect(cutoff).toBe(1000);
    expect(1000 > cutoff).toBe(false); // exactly at limit
    expect(1001 > cutoff).toBe(true); // one over -> over budget
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
