import { describe, expect, it } from "vitest";

import {
  estimateJsonTokens,
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
});
