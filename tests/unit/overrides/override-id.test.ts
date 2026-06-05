import { describe, expect, it } from "vitest";

import { nextOverrideId } from "../../../src/overrides/override-id.js";

describe("override ID generation", () => {
  it("starts at OVR001", () => {
    expect(nextOverrideId([])).toBe("OVR001");
  });

  it("increments existing valid IDs", () => {
    expect(nextOverrideId([{ id: "OVR001" }, { id: "OVR009" }])).toBe("OVR010");
  });

  it("ignores invalid existing IDs", () => {
    expect(nextOverrideId([{ id: "bad" }, { id: "OVR002" }])).toBe("OVR003");
  });
});
