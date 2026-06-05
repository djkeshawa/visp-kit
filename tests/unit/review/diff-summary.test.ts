import { describe, expect, it } from "vitest";

import { isGeneratedVispReviewFile } from "../../../src/review/diff-summary.js";

describe("diff summary helpers", () => {
  it("treats implementation checklist files as generated Visp artifacts", () => {
    expect(
      isGeneratedVispReviewFile(
        ".visp/features/001-add-note-pinning/context/T001.implementation-checklist.md"
      )
    ).toBe(true);
  });
});
