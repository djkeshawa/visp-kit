import { describe, expect, it } from "vitest";

import { overrideExpired, parseOverrideExpiry } from "../../../src/overrides/override-expiry.js";

describe("override expiry", () => {
  it("accepts ISO datetime values", () => {
    expect(parseOverrideExpiry("2026-07-01T00:00:00Z", "2026-01-01T00:00:00.000Z")).toBe(
      "2026-07-01T00:00:00.000Z"
    );
  });

  it("accepts simple day durations", () => {
    expect(parseOverrideExpiry("7d", "2026-01-01T00:00:00.000Z")).toBe("2026-01-08T00:00:00.000Z");
  });

  it("detects expired overrides", () => {
    expect(
      overrideExpired({
        expiresAt: "2026-01-01T00:00:00.000Z",
        now: "2026-01-02T00:00:00.000Z"
      })
    ).toBe(true);
  });

  it("treats an override with no expiry as unexpired", () => {
    expect(overrideExpired({ expiresAt: null, now: "2026-01-02T00:00:00.000Z" })).toBe(false);
    expect(overrideExpired({ now: "2026-01-02T00:00:00.000Z" })).toBe(false);
  });

  it("fails closed when the expiry or the clock cannot be parsed", () => {
    expect(overrideExpired({ expiresAt: "not-a-date", now: "2026-01-02T00:00:00.000Z" })).toBe(
      true
    );
    expect(
      overrideExpired({ expiresAt: "2026-13-01T00:00:00.000Z", now: "2026-01-02T00:00:00.000Z" })
    ).toBe(true);
    expect(overrideExpired({ expiresAt: "2027-01-01T00:00:00.000Z", now: "nonsense" })).toBe(true);
  });
});
