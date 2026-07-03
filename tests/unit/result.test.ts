import { describe, expect, it } from "vitest";

import { err, isErr, isOk, mapError, mapResult, ok, unwrapOr } from "../../src/core/result.js";

describe("result helpers", () => {
  it("narrows successful results", () => {
    const result = ok(42);

    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);

    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it("narrows error results", () => {
    const result = err("failed");

    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);

    if (isErr(result)) {
      expect(result.error).toBe("failed");
    }
  });

  it("maps values without changing errors", () => {
    expect(mapResult(ok(2), (value) => value * 3)).toEqual(ok(6));
    expect(mapResult(err("nope"), (value: number) => value * 3)).toEqual(err("nope"));
  });

  it("maps errors without changing values", () => {
    expect(mapError(err("nope"), (error) => error.toUpperCase())).toEqual(err("NOPE"));
    expect(mapError(ok(2), (error: string) => error.toUpperCase())).toEqual(ok(2));
  });

  it("unwraps successful values or returns a fallback", () => {
    expect(unwrapOr(ok("value"), "fallback")).toBe("value");
    expect(unwrapOr(err("failed"), "fallback")).toBe("fallback");
  });
});
