import { describe, expect, it } from "vitest";

import {
  featureDirectoryForSlug,
  featureDirectoryName,
  nextFeatureIdFromNames,
  parseFeatureNumber
} from "../../../src/features/feature-id.js";

describe("feature IDs", () => {
  it("starts with 001 when no feature folders exist", () => {
    expect(nextFeatureIdFromNames([])).toBe("001");
  });

  it("increments from the highest valid numeric prefix", () => {
    expect(
      nextFeatureIdFromNames(["001-a", "003-c", "002-export-notes"])
    ).toBe("004");
  });

  it("ignores invalid feature folder names", () => {
    expect(
      nextFeatureIdFromNames([
        "draft-feature",
        "abc-test",
        "1-bad-format",
        "001",
        "001-"
      ])
    ).toBe("001");
  });

  it("parses only valid feature directory names", () => {
    expect(parseFeatureNumber("001-note-pinning")).toBe(1);
    expect(parseFeatureNumber("1-note-pinning")).toBeUndefined();
    expect(parseFeatureNumber("001")).toBeUndefined();
  });

  it("creates stable feature directory names", () => {
    expect(featureDirectoryName("001", "add-note-pinning")).toBe(
      "001-add-note-pinning"
    );
  });

  it("finds only exact matching feature slugs", () => {
    expect(
      featureDirectoryForSlug(["001-foo-a", "002-a"], "a")
    ).toBe("002-a");
  });
});
