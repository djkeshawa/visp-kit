import { describe, expect, it } from "vitest";

import {
  estimateJsonTokens,
  estimateTokenRange,
  estimateTokens
} from "../../../src/context/token-estimator.js";

describe("token estimator", () => {
  it("estimates tokens as characters divided by four", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("estimates JSON from formatted output", () => {
    expect(estimateJsonTokens({ value: "abcd" })).toBeGreaterThan(1);
  });

  it("reports a conservative model-agnostic range", () => {
    const range = estimateTokenRange("export function pinNote() { return true; }");
    expect(range.lowerBound).toBeLessThanOrEqual(range.estimate);
    expect(range.upperBound).toBeGreaterThanOrEqual(range.estimate);
    expect(range.profile).toBe("generic-code");
  });
});
