import { describe, expect, it } from "vitest";

import {
  estimateJsonTokens,
  estimateTokens,
  tokenEstimatorName
} from "../../../src/context/token-estimator.js";

describe("token estimator", () => {
  it("is the heuristic-v1 estimator", () => {
    expect(tokenEstimatorName).toBe("heuristic-v1");
  });

  it("returns zero for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("keeps small word estimates compatible with the chars/4 floor", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("never estimates below chars divided by four", () => {
    const samples = [
      "plain prose with several ordinary words in it",
      "const x = { a: 1, b: [2, 3] };",
      JSON.stringify({ nested: { deeply: ["values", 42] } }, null, 2),
      "a".repeat(500)
    ];

    for (const sample of samples) {
      expect(estimateTokens(sample)).toBeGreaterThanOrEqual(Math.ceil(sample.length / 4));
    }
  });

  it("is deterministic and monotonic in input length", () => {
    const base = "export function estimate(input: string): number { return input.length; }";

    expect(estimateTokens(base)).toBe(estimateTokens(base));
    expect(estimateTokens(base + base)).toBeGreaterThan(estimateTokens(base));
  });

  it("charges symbol-dense code more than prose of the same length", () => {
    const code = '{"a":[1,2],"b":{"c":3}};(x)=>{y};';
    const prose = "the quick brown fox jumps over dog".slice(0, code.length);

    expect(prose.length).toBe(code.length);
    expect(estimateTokens(code)).toBeGreaterThan(estimateTokens(prose));
  });

  it("splits long words into subword tokens", () => {
    // 20-character word: max(chars/4 = 5, ceil(20 / 5) = 4) = 5.
    expect(estimateTokens("internationalization")).toBe(5);
  });

  it("estimates JSON from formatted output", () => {
    expect(estimateJsonTokens({ value: "abcd" })).toBeGreaterThan(1);
  });
});
