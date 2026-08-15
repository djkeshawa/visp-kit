import { describe, expect, it } from "vitest";

import { isWorkingTreeOnlyGenerated } from "../../../src/review/review-decision.js";

/** `git status --porcelain=v1 -z` puts each entry, and each rename's original
 *  path, in its own NUL-terminated field. */
const z = (...fields: string[]) => `${fields.join("\0")}\0`;

describe("porcelain -z generated-file detection", () => {
  it("treats a clean tree as generated-only", () => {
    expect(isWorkingTreeOnlyGenerated("")).toBe(true);
  });

  it("reads a renamed generated artifact as generated on both paths", () => {
    expect(
      isWorkingTreeOnlyGenerated(z("R  .visp/reports/new.json", ".visp/reports/old.json"))
    ).toBe(true);
  });

  it("still reports a real source change", () => {
    expect(isWorkingTreeOnlyGenerated(z(" M src/index.ts"))).toBe(false);
  });

  it("still reports a renamed source file", () => {
    expect(isWorkingTreeOnlyGenerated(z("R  src/new.ts", "src/old.ts"))).toBe(false);
  });

  it("does not let a rename's original path mask a later real change", () => {
    expect(
      isWorkingTreeOnlyGenerated(
        z("R  .visp/reports/new.json", ".visp/reports/old.json", "?? src/planted.ts")
      )
    ).toBe(false);
  });
});
