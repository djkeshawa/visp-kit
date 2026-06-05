import { describe, expect, it } from "vitest";

import {
  overrideExpired,
  parseOverrideExpiry
} from "../../../src/overrides/override-expiry.js";

describe("override expiry", () => {
  it("accepts ISO datetime values", () => {
    expect(parseOverrideExpiry("2026-07-01T00:00:00Z", "2026-01-01T00:00:00.000Z"))
      .toBe("2026-07-01T00:00:00.000Z");
  });

  it("accepts simple day durations", () => {
    expect(parseOverrideExpiry("7d", "2026-01-01T00:00:00.000Z"))
      .toBe("2026-01-08T00:00:00.000Z");
  });

  it("detects expired overrides", () => {
    expect(overrideExpired({
      expiresAt: "2026-01-01T00:00:00.000Z",
      now: "2026-01-02T00:00:00.000Z"
    })).toBe(true);
  });
});
