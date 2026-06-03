import { describe, expect, it } from "vitest";

import { renderPrPrompt } from "../../../src/pr/pr-prompt.js";

describe("PR prompt renderer", () => {
  it("references artifact paths instead of inlining diffs", () => {
    const prompt = renderPrPrompt({ featureKey: "001-add-note-pinning" });

    expect(prompt).toContain(".visp/features/001-add-note-pinning/pr.md");
    expect(prompt).toContain("Do not include huge diffs");
  });
});
