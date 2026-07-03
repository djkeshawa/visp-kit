import { describe, expect, it } from "vitest";

import { isErr } from "../../../src/core/result.js";
import {
  featureDirectoryForSlug,
  featureDirectoryName,
  nextFeatureIdFromNames,
  parseFeatureNumber
} from "../../../src/features/feature-id.js";

function expectOkValue(result: ReturnType<typeof nextFeatureIdFromNames>): string {
  expect(result.ok).toBe(true);

  if (!result.ok) throw new Error("expected ok result");

  return result.value;
}

describe("feature IDs", () => {
  it("starts with 001 when no feature folders exist", () => {
    expect(expectOkValue(nextFeatureIdFromNames([]))).toBe("001");
  });

  it("increments from the highest valid numeric prefix", () => {
    expect(expectOkValue(nextFeatureIdFromNames(["001-a", "003-c", "002-export-notes"]))).toBe(
      "004"
    );
  });

  it("ignores invalid feature folder names", () => {
    expect(
      expectOkValue(
        nextFeatureIdFromNames(["draft-feature", "abc-test", "1-bad-format", "001", "001-"])
      )
    ).toBe("001");
  });

  it("returns a validation error at the 999 feature limit", () => {
    const result = nextFeatureIdFromNames(["999-last-feature"]);

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.message).toContain("Feature ID limit reached");
    }
  });

  it("parses only valid feature directory names", () => {
    expect(parseFeatureNumber("001-note-pinning")).toBe(1);
    expect(parseFeatureNumber("1-note-pinning")).toBeUndefined();
    expect(parseFeatureNumber("001")).toBeUndefined();
  });

  it("creates stable feature directory names", () => {
    expect(featureDirectoryName("001", "add-note-pinning")).toBe("001-add-note-pinning");
  });

  it("finds only exact matching feature slugs", () => {
    expect(featureDirectoryForSlug(["001-foo-a", "002-a"], "a")).toBe("002-a");
  });
});
